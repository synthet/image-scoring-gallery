/**
 * driftara core: search -> resolve -> execute over one catalog (port of vexlum's modules/vexlum/service.py).
 *
 * The same service runs in two places:
 * - stdio MCP / CLI (`dist/driftara.js`): local, api, cdp and system actions run in-process; ipc.* and
 *   live.gallery_* calls are forwarded whole to the live server's `execute` tool.
 * - the live SSE server inside Electron main (`hooks` set): ipc.* runs through hooks.invokeIpc.
 * The tier policy is applied by the process that runs the action.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { ActionBm25Index, type ActionSearchEntry } from "../actions/actionBm25.js";
import type { GalleryLiveHooks } from "../tools/liveIpc.js";
import type { ToolResult } from "../tools/core.js";
import { DriftaraCatalog, loadCatalog } from "./catalog.js";
import { DriftaraError, ValidationError } from "./errors.js";
import { check, issueToken, requirements } from "./policy.js";
import { redact } from "./redact.js";
import type { DriftaraRecord, Envelope } from "./types.js";
import { validateArguments } from "./validate.js";

export const DRIFTARA_VERSION = "3.0.0";
export const CONTRACT_DOC = "docs/technical/DRIFTARA_MCP.md";
export const VEXLUM_HINT =
    "Backend REST, SQL and pipeline actions live in vexlum (image-scoring-pipeline): use the vexlum MCP server " +
    "or scripts\\vexlum.cmd there. driftara covers the gallery app: local tools, Electron IPC (ipc.*), renderer " +
    "automation (live.cdp_*) and gallery-side backend probes (api.*).";
export const LIVE_HINT =
    "Start the gallery with its live server: `npm run dev` (ELECTRON_IS_DEV=1) or ENABLE_GALLERY_MCP_SSE=1. " +
    "driftara finds it through gallery-mcp.lock or GALLERY_LIVE_MCP_SSE_URL.";

export interface ExecuteOptions {
    dryRun?: boolean;
    confirmed?: boolean;
    confirmToken?: string;
    requestId?: string;
}

export interface StatusProbes {
    live: () => Promise<Record<string, unknown>>;
    cdp: () => Promise<Record<string, unknown>>;
    api: () => Promise<Record<string, unknown>>;
}

export interface DriftaraRuntime {
    catalog?: DriftaraCatalog;
    /** Set inside the live server (Electron main). ipc.* runs through hooks.invokeIpc. */
    hooks?: GalleryLiveHooks;
    /** stdio / CLI: send an execute call for an ipc.* or live.gallery_* action to the live server. */
    forwardToLive?: (args: Record<string, unknown>) => Promise<Envelope>;
    /** Runs local / api / cdp / live_hook tools (default: the gallery tool handlers). */
    runTool?: (tool: string, args: Record<string, unknown>, hooks: GalleryLiveHooks) => Promise<ToolResult>;
    statusProbes?: StatusProbes;
}

type ImagePart = { type: string; data?: string; mimeType?: string };

/** Image content produced by an execute call, for the MCP layer to attach (kept out of the JSON envelope). */
export const envelopeImages = new WeakMap<object, ImagePart[]>();

function round(n: number, digits: number): number {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function schemaArgs(record: DriftaraRecord): { required: string[]; optional: string[] } {
    const props = Object.keys((record.input_schema.properties ?? {}) as Record<string, unknown>);
    const required = ((record.input_schema.required as string[] | undefined) ?? []).filter((k) => props.includes(k));
    return { required, optional: props.filter((k) => !required.includes(k)) };
}

function placeholder(schema: Record<string, unknown>): unknown {
    if ("default" in schema) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    if (Array.isArray(schema.anyOf) && schema.anyOf.length) return placeholder(schema.anyOf[0] as Record<string, unknown>);
    switch (schema.type) {
        case "number":
        case "integer":
            return 0;
        case "boolean":
            return false;
        case "array":
            return [];
        case "object":
            return {};
        default:
            return "<string>";
    }
}

/** Rebuild the positional IPC call from validated, named arguments. */
export function ipcCallArgs(params: Array<{ name: string } | { keys: string[] }>, args: Record<string, unknown>): unknown[] {
    const out = params.map((p) =>
        "keys" in p ? Object.fromEntries(p.keys.filter((k) => k in args).map((k) => [k, args[k]])) : args[p.name],
    );
    while (out.length && out[out.length - 1] === undefined) out.pop();
    return out;
}

function needsLiveApp(record: DriftaraRecord): boolean {
    return record.executor.kind === "ipc" || record.executor.kind === "live_hook";
}

function toolResultToData(result: ToolResult): { data: unknown; isError: boolean; images: ImagePart[] } {
    const images = result.content.filter((c) => c.type === "image");
    if (result.isError) {
        return { data: { message: result.content.map((c) => c.text ?? "").join("\n") }, isError: true, images };
    }
    const parts = result.content.map((c) => {
        if (c.type === "text") return c.text ?? "";
        if (c.type === "image") return { type: "image", mimeType: c.mimeType, data_length: (c.data ?? "").length };
        return c;
    });
    if (parts.length === 1 && typeof parts[0] === "string") {
        try {
            return { data: JSON.parse(parts[0]), isError: false, images };
        } catch {
            return { data: parts[0], isError: false, images };
        }
    }
    return { data: parts, isError: false, images };
}

const CONNECTION_FAILURE = /ECONNREFUSED|fetch failed|No page target|connect|socket hang up|ENOTFOUND|timed out/i;

export class DriftaraService {
    readonly catalog: DriftaraCatalog;
    private readonly runtime: DriftaraRuntime;
    private readonly index: ActionBm25Index;

    constructor(runtime: DriftaraRuntime = {}) {
        this.runtime = runtime;
        this.catalog = runtime.catalog ?? loadCatalog();
        const entries: ActionSearchEntry[] = this.catalog.actions.map((a) => ({
            action_id: a.action_id,
            title: a.title,
            description: a.description,
            tags: a.tags,
            aliases: a.aliases,
            intent_examples: a.intent_examples,
            argument_names: Object.keys((a.input_schema.properties ?? {}) as Record<string, unknown>).join(" "),
            category: a.category,
        }));
        this.index = new ActionBm25Index(entries, this.catalog.fieldWeights);
    }

    // ------------------------------------------------------------------ search

    search(args: Record<string, unknown> = {}): Record<string, unknown> {
        const query = String(args.query ?? "").trim();
        const limit = Math.max(1, Math.min(Number(args.limit ?? 10) || 10, 50));
        const source = args.source ? String(args.source) : undefined;
        const category = args.category ? String(args.category) : undefined;
        const tier = args.tier ? String(args.tier) : undefined;
        const includeSchemas = args.include_schemas === true;

        const keep = (a: DriftaraRecord) =>
            (!source || a.source === source) &&
            (!category || a.category === category || a.category.startsWith(`${category}.`)) &&
            (!tier || a.tier === tier);
        const row = (a: DriftaraRecord, confidence: number) => {
            const { required, optional } = schemaArgs(a);
            return {
                action_id: a.action_id,
                title: a.title,
                description: a.description.slice(0, 240),
                source: a.source,
                category: a.category,
                tier: a.tier,
                confidence,
                required_args: required,
                optional_args: optional,
                ...(includeSchemas ? { input_schema: a.input_schema } : {}),
            };
        };

        if (!query) {
            const results = this.catalog.actions.filter(keep).slice(0, limit).map((a) => row(a, 0));
            return {
                query,
                count: results.length,
                results,
                low_confidence: true,
                catalog: this.catalog.counts(),
                hint: "Pass a query, or filter by source/category. Then resolve(action_id) before execute.",
            };
        }

        const hits = this.index.search(query, { limit: 200, maxLimit: 200 });
        const maxRaw = hits.length ? hits[0].score : 0;
        const rows: ReturnType<typeof row>[] = [];
        for (const hit of hits) {
            const a = this.catalog.get(hit.entry.action_id);
            if (!a || !keep(a)) continue;
            rows.push(row(a, round(Math.min(1, hit.score / (maxRaw || 1)), 4)));
            if (rows.length >= Math.max(limit, 8)) break;
        }
        const top = rows[0]?.confidence ?? 0;
        const second = rows[1]?.confidence ?? 0;
        const lowConfidence = rows.length === 0 || top < 0.35 || (rows.length > 1 && top - second < 0.08);
        const results = rows.slice(0, limit);
        return {
            query,
            count: results.length,
            results,
            low_confidence: lowConfidence,
            next: "resolve(action_id) for the full schema and policy, then execute(action_id, arguments)",
            ...(lowConfidence ? { hint: VEXLUM_HINT } : {}),
        };
    }

    // ----------------------------------------------------------------- resolve

    private unknownAction(actionId: string, requestId: string | null): Envelope {
        const needle = actionId.replace(/[._:-]+/g, " ");
        const suggestions = this.index.search(needle, { limit: 5 }).map((h) => h.entry.action_id);
        return {
            status: "error",
            code: "unknown_action",
            message: `Unknown action_id: ${actionId}`,
            action_id: actionId,
            request_id: requestId,
            details: {
                suggestions,
                hint:
                    "search(query) first; ids also accept legacy tool names and raw IPC channels such as 'db:get-images'. " +
                    VEXLUM_HINT,
            },
        };
    }

    resolve(actionId: string): Envelope {
        const record = this.catalog.resolveId(actionId);
        if (!record) return this.unknownAction(actionId, null);
        const { required } = schemaArgs(record);
        const props = (record.input_schema.properties ?? {}) as Record<string, Record<string, unknown>>;
        const exampleArgs = Object.fromEntries(required.map((k) => [k, placeholder(props[k] ?? {})]));
        const base = { action_id: record.action_id, arguments: exampleArgs };
        const example =
            record.tier === "read"
                ? base
                : record.tier === "write"
                  ? { ...base, confirmed: true }
                  : [
                        { ...base, dry_run: true },
                        { ...base, confirmed: true, confirm_token: "<from dry_run data.confirm_token>" },
                    ];
        const argsFlag = required.length ? ` --args '${JSON.stringify(exampleArgs)}'` : "";
        const cliSuffix =
            record.tier === "write" ? " --confirm" : record.tier === "destructive" ? " --dry-run   # then: --confirm --token <confirm_token>" : "";
        const ex = record.executor;
        return {
            status: "success",
            action_id: record.action_id,
            resolved_from: record.action_id === actionId.trim() ? null : actionId,
            source: record.source,
            title: record.title,
            description: record.description,
            category: record.category,
            tier: record.tier,
            requires: requirements(record.tier),
            dry_run: record.native_dry_run ? "native preview" : "validates arguments only",
            needs_live_app: needsLiveApp(record) || record.source === "cdp",
            input_schema: record.input_schema,
            executor:
                ex.kind === "ipc"
                    ? { kind: ex.kind, channel: ex.channel, file: ex.file }
                    : ex.kind === "system"
                      ? { kind: ex.kind, name: ex.name }
                      : { kind: ex.kind, tool: ex.tool },
            legacy_tool_name: record.legacy_tool_name,
            notes: record.notes,
            canonical_docs: record.canonical_docs,
            example,
            cli: `driftara exec ${record.action_id}${argsFlag}${cliSuffix}`,
        };
    }

    // ------------------------------------------------------------------- list

    list(args: Record<string, unknown> = {}): Envelope {
        const actions = this.catalog.actions
            .filter(
                (a) =>
                    (!args.source || a.source === args.source) &&
                    (!args.category || a.category.startsWith(String(args.category))) &&
                    (!args.tier || a.tier === args.tier),
            )
            .map((a) => ({ action_id: a.action_id, tier: a.tier, source: a.source, title: a.title }));
        return { status: "success", count: actions.length, actions };
    }

    // ---------------------------------------------------------------- execute

    private errorEnvelope(
        err: DriftaraError,
        actionId: string,
        requestId: string,
        record?: DriftaraRecord,
    ): Envelope {
        return {
            status: "error",
            code: err.code,
            message: err.message,
            action_id: actionId,
            request_id: requestId,
            ...(record ? { tier: record.tier, source: record.source } : {}),
            details: err.details,
        };
    }

    private liveUnavailable(record: DriftaraRecord, actionId: string, requestId: string, reason: string): Envelope {
        return this.errorEnvelope(
            new DriftaraError("live_unavailable", `${record.action_id} needs the running gallery app: ${reason}`, { hint: LIVE_HINT }),
            actionId,
            requestId,
            record,
        );
    }

    private describeCall(record: DriftaraRecord, args: Record<string, unknown>): Record<string, unknown> {
        const ex = record.executor;
        if (ex.kind === "ipc") return { ipc_channel: ex.channel, ipc_args: ipcCallArgs(ex.params, args) };
        if (ex.kind === "system") return { system: ex.name };
        return { tool: ex.tool, args };
    }

    private async runExecutor(record: DriftaraRecord, args: Record<string, unknown>): Promise<{ data: unknown; images: ImagePart[] }> {
        const ex = record.executor;
        const hooks = this.runtime.hooks ?? {};
        if (ex.kind === "system") {
            return { data: ex.name === "status" ? await this.status() : this.categories(), images: [] };
        }
        if (ex.kind === "ipc") {
            if (!hooks.invokeIpc) throw new DriftaraError("live_unavailable", "this live server has no Electron IPC hooks", { hint: LIVE_HINT });
            const raw = await hooks.invokeIpc(ex.channel, ipcCallArgs(ex.params, args));
            if (ex.wrapped && isPlainObject(raw) && "ok" in raw) {
                if (raw.ok === false) {
                    throw new DriftaraError("ipc_error", String(raw.error ?? "IPC handler failed"), { channel: ex.channel });
                }
                return { data: raw.data ?? null, images: [] };
            }
            return { data: raw ?? null, images: [] };
        }
        const runTool =
            this.runtime.runTool ??
            (async (tool: string, a: Record<string, unknown>, h: GalleryLiveHooks) => {
                const { executeGalleryTool } = await import("../createGalleryMcpServer.js");
                return (await executeGalleryTool(tool, a, h)) as ToolResult;
            });
        const result = toolResultToData(await runTool(ex.tool, args, hooks));
        if (result.isError) {
            const message = String((result.data as { message?: string }).message ?? "tool failed");
            if (record.source === "cdp" && CONNECTION_FAILURE.test(message)) {
                throw new DriftaraError("live_unavailable", `Electron CDP is not reachable: ${message}`, {
                    hint: "Run the gallery in dev with remote debugging (default port 9222; ELECTRON_CDP_PORT overrides).",
                });
            }
            throw new DriftaraError("handler_error", message, {});
        }
        return { data: result.data, images: result.images };
    }

    async execute(actionId: string, callArgs: unknown = {}, opts: ExecuteOptions = {}): Promise<Envelope> {
        const started = performance.now();
        const requestId = opts.requestId?.trim() || randomUUID();
        const dryRun = opts.dryRun === true;
        let record: DriftaraRecord | undefined;
        let ranExecutor = false;
        try {
            if (!isPlainObject(callArgs)) throw new ValidationError("arguments must be a JSON object");
            record = this.catalog.resolveId(actionId);
            if (!record) return this.unknownAction(actionId, requestId);
            const warnings: string[] = [];
            if (record.action_id !== actionId.trim()) warnings.push(`resolved '${actionId}' -> '${record.action_id}'`);
            const validated = validateArguments(callArgs, record.input_schema);

            if (needsLiveApp(record) && !this.runtime.hooks) {
                if (!this.runtime.forwardToLive) {
                    return this.liveUnavailable(record, actionId, requestId, "this process has no Electron hooks");
                }
                let env: Envelope;
                try {
                    env = await this.runtime.forwardToLive({
                        action_id: record.action_id,
                        arguments: validated,
                        dry_run: dryRun,
                        confirmed: opts.confirmed === true,
                        ...(opts.confirmToken ? { confirm_token: opts.confirmToken } : {}),
                        request_id: requestId,
                    });
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    if (/call '\w+' timed out/.test(message)) {
                        // Connected, then no answer in time: the action may still be running in the app.
                        throw new DriftaraError("live_timeout", message, {
                            note: "the live server accepted the call; the action may still be running. Check the app before retrying.",
                            hint: "Raise DRIFTARA_LIVE_TIMEOUT_MS (default 120000) for long IPC actions.",
                        });
                    }
                    return this.liveUnavailable(record, actionId, requestId, message);
                }
                if (warnings.length) env.warnings = [...warnings, ...((env.warnings as string[] | undefined) ?? [])];
                return env;
            }

            check(record, validated, { dryRun, confirmed: opts.confirmed === true, confirmToken: opts.confirmToken });

            let data: unknown;
            let images: ImagePart[] = [];
            if (dryRun) {
                const preview: Record<string, unknown> = {
                    preview: { validated_arguments: validated, would_invoke: this.describeCall(record, validated) },
                };
                if (record.tier !== "read") {
                    const token = issueToken(record.action_id, validated);
                    Object.assign(preview, token, {
                        next: {
                            action_id: record.action_id,
                            arguments: validated,
                            confirmed: true,
                            ...(record.tier === "destructive" ? { confirm_token: token.confirm_token } : {}),
                        },
                    });
                }
                data = preview;
            } else {
                ranExecutor = true;
                ({ data, images } = await this.runExecutor(record, validated));
                data = redact(data);
            }

            const env: Envelope = {
                status: "success",
                action_id: record.action_id,
                request_id: requestId,
                source: record.source,
                tier: record.tier,
                dry_run: dryRun,
                summary: `${dryRun ? "Dry run: " : ""}${record.title || record.action_id}`,
                data,
                warnings,
                notes: record.notes ?? [],
                canonical_docs: record.canonical_docs ?? [],
                duration_ms: round(performance.now() - started, 1),
            };
            if (images.length) envelopeImages.set(env, images);
            return env;
        } catch (err) {
            if (err instanceof DriftaraError) return this.errorEnvelope(err, actionId, requestId, record);
            const message = err instanceof Error ? err.message : String(err);
            return {
                status: "error",
                code: "handler_error",
                message,
                action_id: actionId,
                request_id: requestId,
                ...(record ? { tier: record.tier, source: record.source } : {}),
                details: { type: err instanceof Error ? err.name : typeof err },
            };
        } finally {
            if (ranExecutor && record && record.tier !== "read") {
                const ms = round(performance.now() - started, 1);
                console.error(`driftara_execute action=${record.action_id} tier=${record.tier} request_id=${requestId} duration_ms=${ms}`);
            }
        }
    }

    // ----------------------------------------------------------------- system

    categories(): Record<string, unknown> {
        const byCategory: Record<string, Record<string, number>> = {};
        for (const a of this.catalog.actions) {
            byCategory[a.category] ??= { read: 0, write: 0, destructive: 0, total: 0 };
            byCategory[a.category][a.tier] += 1;
            byCategory[a.category].total += 1;
        }
        return { total: this.catalog.actions.length, by_source: this.catalog.counts(), by_category: byCategory };
    }

    async status(): Promise<Record<string, unknown>> {
        const probes = this.runtime.statusProbes ?? (await defaultProbes());
        const hooks = this.runtime.hooks;
        const [live, cdp, api] = await Promise.all([
            hooks ? Promise.resolve({ in_process: true, ipc_hooks: Boolean(hooks.invokeIpc) }) : probes.live(),
            probes.cdp(),
            probes.api(),
        ]);
        const liveOk = Boolean(hooks?.invokeIpc) || (live as { ok?: boolean }).ok === true;
        return {
            server: "driftara",
            version: DRIFTARA_VERSION,
            catalog: { total: this.catalog.actions.length, by_source: this.catalog.counts() },
            live_server: live,
            electron_cdp: cdp,
            backend_api: api,
            hints: {
                ipc: liveOk ? "ipc.* actions reach the running gallery." : LIVE_HINT,
                cdp: (cdp as { reachable?: boolean }).reachable
                    ? "live.cdp_* actions should work."
                    : "Run the gallery in dev with remote debugging (default port 9222) for live.cdp_*.",
                backend: VEXLUM_HINT,
            },
        };
    }
}

async function defaultProbes(): Promise<StatusProbes> {
    const [{ probeLiveMcp }, { probeElectronCdp, probePythonApi }] = await Promise.all([
        import("../utils/liveClient.js"),
        import("../utils/capabilities.js"),
    ]);
    return {
        live: () => probeLiveMcp() as Promise<Record<string, unknown>>,
        cdp: () => probeElectronCdp() as Promise<Record<string, unknown>>,
        api: () => probePythonApi() as Promise<Record<string, unknown>>,
    };
}

/** Deprecated `dispatch`: execute plus a warning (old is-ui-mcp contract). */
export function withDispatchWarning(env: Envelope): Envelope {
    env.warnings = [
        ...((env.warnings as string[] | undefined) ?? []),
        `dispatch is deprecated; use execute (driftara). See ${CONTRACT_DOC}`,
    ];
    return env;
}

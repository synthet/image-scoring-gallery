/** driftara MCP surface: search, resolve, execute (+ deprecated dispatch, sse_status). Contract: docs/technical/DRIFTARA_MCP.md */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { DISPATCH, DRIFTARA, EXECUTE, RESOLVE, SEARCH, SSE_STATUS } from "./names.js";
import { DRIFTARA_VERSION, DriftaraService, envelopeImages, withDispatchWarning, type DriftaraRuntime } from "./driftara/service.js";
import { SOURCES } from "./driftara/types.js";
import { TIERS } from "./driftara/policy.js";
import type { Envelope } from "./driftara/types.js";

export interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: Record<string, unknown>;
}

export const driftaraToolDefs: ToolDef[] = [
    {
        name: SEARCH,
        description:
            "Step 1 of 3. BM25 search over every Driftara Gallery capability: Electron IPC (ipc.*), renderer " +
            "automation (live.cdp_*), local diagnostics (local.*), gallery-side backend probes (api.*). Never " +
            "executes anything. Backend REST/SQL actions are in vexlum.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Natural-language intent or keywords. Empty lists actions." },
                limit: { type: "number", description: "Max results (default 10, max 50)." },
                source: { type: "string", enum: [...SOURCES] },
                category: { type: "string", description: "e.g. ipc.db, ipc.backup, cdp, local, api, system" },
                tier: { type: "string", enum: [...TIERS] },
                include_schemas: { type: "boolean", description: "Inline input_schema on each result." },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: RESOLVE,
        description:
            "Step 2 of 3. Full contract for one action: input_schema, tier, confirmation requirements, example " +
            "call. Accepts action_id, legacy tool name or raw IPC channel ('db:get-images').",
        inputSchema: {
            type: "object",
            properties: { action_id: { type: "string" } },
            required: ["action_id"],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: EXECUTE,
        description:
            "Step 3 of 3. Run an action. read: runs. write: confirmed=true. destructive: DRIFTARA_ALLOW_ELEVATED=1 " +
            "on the process that runs it (the gallery app for ipc.*), dry_run=true first (returns confirm_token), " +
            "then confirmed=true + confirm_token with the same arguments.",
        inputSchema: {
            type: "object",
            properties: {
                action_id: { type: "string" },
                arguments: { type: "object", description: "Arguments matching resolve().input_schema." },
                dry_run: { type: "boolean" },
                confirmed: { type: "boolean" },
                confirm_token: { type: "string" },
                request_id: { type: "string" },
            },
            required: ["action_id"],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

export const deprecatedToolDefs: ToolDef[] = [
    {
        name: DISPATCH,
        description: "DEPRECATED alias of execute (old is-ui-mcp contract). Use search -> resolve -> execute.",
        inputSchema: {
            type: "object",
            properties: {
                action_id: { type: "string" },
                arguments: { type: "object" },
                dry_run: { type: "boolean" },
                confirmed: { type: "boolean" },
                request_id: { type: "string" },
                allow_deprecated: { type: "boolean" },
                expected_version: { type: "number" },
            },
            required: ["action_id"],
        },
    },
    {
        name: SSE_STATUS,
        description: "DEPRECATED. Use execute('system.status').",
        inputSchema: { type: "object", properties: {} },
    },
];

export function listToolDefs(includeDeprecated = process.env.DRIFTARA_HIDE_DEPRECATED !== "1"): ToolDef[] {
    return includeDeprecated ? [...driftaraToolDefs, ...deprecatedToolDefs] : [...driftaraToolDefs];
}

function str(v: unknown): string | undefined {
    return v === undefined || v === null || v === "" ? undefined : String(v);
}

/** Shared by the MCP server and the CLI. */
export async function callDriftaraTool(
    service: DriftaraService,
    name: string,
    args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    if (name === SEARCH) return service.search(args);
    if (name === RESOLVE) return service.resolve(String(args.action_id ?? ""));
    if (name === "list") return service.list(args);
    if (name === EXECUTE || name === DISPATCH) {
        const actionId = String(args.action_id ?? "").trim();
        if (!actionId) return { status: "error", code: "validation_error", message: "action_id is required" };
        const env = await service.execute(actionId, args.arguments ?? {}, {
            dryRun: args.dry_run === true,
            confirmed: args.confirmed === true,
            confirmToken: name === EXECUTE ? str(args.confirm_token) : undefined,
            requestId: str(args.request_id),
        });
        return name === DISPATCH ? withDispatchWarning(env) : env;
    }
    if (name === SSE_STATUS) return service.execute("system.status", {});
    return { status: "error", code: "unknown_tool", message: `Unknown driftara tool: ${name}` };
}

function toolResult(payload: Record<string, unknown>) {
    const images = envelopeImages.get(payload) ?? [];
    return {
        content: [
            { type: "text" as const, text: JSON.stringify(payload, null, 2) },
            ...images.map((img) => ({ type: "image" as const, data: img.data ?? "", mimeType: img.mimeType ?? "image/png" })),
        ],
        ...(payload.status === "error" ? { isError: true } : {}),
    };
}

export function createDriftaraServer(
    options: { serverName?: string; runtime?: DriftaraRuntime } = {},
): { server: Server; toolDefs: ToolDef[]; service: DriftaraService } {
    const service = new DriftaraService(options.runtime ?? {});
    const toolDefs = listToolDefs();
    const server = new Server({ name: options.serverName ?? DRIFTARA, version: DRIFTARA_VERSION }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefs }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: toolArgs } = request.params;
        try {
            return toolResult(await callDriftaraTool(service, name, (toolArgs ?? {}) as Record<string, unknown>));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolResult({ status: "error", code: "host_error", message: `Error executing ${name}: ${msg}` } as Envelope);
        }
    });

    return { server, toolDefs, service };
}

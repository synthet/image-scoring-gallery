import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { callDriftaraTool, listToolDefs } from "../createDriftaraServer.js";
import type { ToolResult } from "../tools/core.js";
import { ELEVATED_ENV, resetTokenKeyCache } from "./policy.js";
import { DriftaraService, envelopeImages, ipcCallArgs, type DriftaraRuntime } from "./service.js";

const probes = {
    live: async () => ({ ok: false, url: "http://127.0.0.1:9373/mcp/sse", error: "down" }),
    cdp: async () => ({ reachable: false, cdp_url: "http://127.0.0.1:9222" }),
    api: async () => ({ reachable: true, base_url: "http://127.0.0.1:7860" }),
};

function inApp(invoke: (channel: string, args: unknown[]) => Promise<unknown>, extra: Partial<DriftaraRuntime> = {}) {
    return new DriftaraService({ hooks: { invokeIpc: invoke }, statusProbes: probes, ...extra });
}

const okText = (text: string): ToolResult => ({ content: [{ type: "text", text }] });

describe("driftara service", () => {
    beforeEach(() => {
        process.env.DRIFTARA_TOKEN_SECRET = "test-secret";
        delete process.env[ELEVATED_ENV];
        resetTokenKeyCache();
    });
    afterEach(() => {
        delete process.env.DRIFTARA_TOKEN_SECRET;
        delete process.env[ELEVATED_ENV];
        resetTokenKeyCache();
    });

    describe("search", () => {
        const svc = new DriftaraService({ statusProbes: probes });

        it("ranks gallery status first and filters", () => {
            const r = svc.search({ query: "gallery status" }) as { results: Array<{ action_id: string }> };
            assert.equal(r.results[0].action_id, "local.gallery_status");
            const ipcOnly = svc.search({ query: "delete image", source: "ipc", tier: "destructive" }) as {
                results: Array<{ action_id: string; source: string; tier: string }>;
            };
            assert.equal(ipcOnly.results[0].action_id, "ipc.db.delete-image");
            assert.ok(ipcOnly.results.every((x) => x.source === "ipc" && x.tier === "destructive"));
            const backup = svc.search({ query: "verify", category: "ipc.backup" }) as { results: Array<{ category: string }> };
            assert.ok(backup.results.length > 0 && backup.results.every((x) => x.category === "ipc.backup"));
        });

        it("empty query lists actions with catalog counts", () => {
            const r = svc.search({ query: "", source: "system" }) as { count: number; catalog: Record<string, unknown>; low_confidence: boolean };
            assert.equal(r.count, 2);
            assert.equal(r.low_confidence, true);
            assert.ok(r.catalog.ipc);
        });

        it("low-confidence results point backend intents at vexlum", () => {
            const r = svc.search({ query: "openapi sql migrations" }) as { low_confidence: boolean; hint?: string };
            assert.equal(r.low_confidence, true);
            assert.match(r.hint ?? "", /vexlum/);
        });
    });

    describe("resolve", () => {
        const svc = new DriftaraService({ statusProbes: probes });

        it("advertises the destructive contract", () => {
            const r = svc.resolve("db:delete-image") as Record<string, unknown>;
            assert.equal(r.status, "success");
            assert.equal(r.action_id, "ipc.db.delete-image");
            assert.equal(r.resolved_from, "db:delete-image");
            assert.deepEqual(r.requires, { confirmed: true, confirm_token: true, env: "DRIFTARA_ALLOW_ELEVATED=1" });
            assert.ok(Array.isArray(r.example) && r.example.length === 2);
            assert.match(String(r.cli), /--dry-run/);
            assert.equal(r.needs_live_app, true);
        });

        it("unknown ids return suggestions and a vexlum hint", () => {
            const r = svc.resolve("db.delete_images") as { status: string; code: string; details: { suggestions: string[]; hint: string } };
            assert.equal(r.status, "error");
            assert.equal(r.code, "unknown_action");
            assert.ok(r.details.suggestions.includes("ipc.db.delete-image"));
            assert.match(r.details.hint, /vexlum/);
        });
    });

    describe("execute", () => {
        it("rejects unknown and mistyped arguments", async () => {
            const svc = inApp(async () => null);
            const extra = await svc.execute("ipc.db.get-image-count", { bogus: 1 });
            assert.equal(extra.code, "validation_error");
            assert.deepEqual((extra.details as { extra_keys: string[] }).extra_keys, ["bogus"]);
            const typed = await svc.execute("ipc.backup.preview", { targetPath: 5 });
            assert.equal(typed.code, "validation_error");
            const missing = await svc.execute("ipc.backup.preview", {});
            assert.equal(missing.code, "validation_error");
            const notObject = await svc.execute("ipc.backup.preview", [] as unknown);
            assert.equal(notObject.code, "validation_error");
        });

        it("write needs confirmed=true", async () => {
            const calls: unknown[] = [];
            const svc = inApp(async (c, a) => calls.push([c, a]));
            const r = await svc.execute("ipc.app.set-gallery-mode", { mode: "db" });
            assert.equal(r.code, "confirmation_required");
            assert.equal(r.tier, "write");
            assert.equal(calls.length, 0);
            const ok = await svc.execute("ipc.app.set-gallery-mode", { mode: "db" }, { confirmed: true });
            assert.equal(ok.status, "success");
            assert.deepEqual(calls, [["app:set-gallery-mode", ["db"]]]);
        });

        it("runs the full destructive flow against the IPC hook", async () => {
            const calls: Array<[string, unknown[]]> = [];
            const svc = inApp(async (c, a) => {
                calls.push([c, a]);
                return { ok: true, data: { deleted: true } };
            });
            const dry = await svc.execute("ipc.db.delete-image", { id: 7 }, { dryRun: true });
            assert.equal(dry.status, "success");
            assert.equal(dry.dry_run, true);
            const data = dry.data as { confirm_token: string; preview: { would_invoke: { ipc_channel: string; ipc_args: unknown[] } } };
            assert.deepEqual(data.preview.would_invoke, { ipc_channel: "db:delete-image", ipc_args: [7] });
            assert.equal(calls.length, 0, "dry run must not invoke");

            const noEnv = await svc.execute("ipc.db.delete-image", { id: 7 }, { confirmed: true, confirmToken: data.confirm_token });
            assert.equal(noEnv.code, "policy_rejected");

            process.env[ELEVATED_ENV] = "1";
            const changed = await svc.execute("ipc.db.delete-image", { id: 8 }, { confirmed: true, confirmToken: data.confirm_token });
            assert.equal(changed.code, "confirm_token_invalid");
            assert.equal(calls.length, 0);

            const ok = await svc.execute("ipc.db.delete-image", { id: 7 }, { confirmed: true, confirmToken: data.confirm_token });
            assert.equal(ok.status, "success");
            assert.deepEqual(ok.data, { deleted: true });
            assert.deepEqual(calls, [["db:delete-image", [7]]]);
        });

        it("maps wrapIpcHandler failures to ipc_error and unwraps data", async () => {
            const failing = inApp(async () => ({ ok: false, error: "boom" }));
            const r = await failing.execute("ipc.db.get-image-count", {});
            assert.equal(r.code, "ipc_error");
            assert.equal(r.message, "boom");
            const unwrapped = inApp(async () => "pong");
            assert.equal((await unwrapped.execute("ipc.ping", {})).data, "pong");
        });

        it("rebuilds object-binding parameters", async () => {
            let seen: unknown[] = [];
            const svc = inApp(async (_c, a) => {
                seen = a;
                return { ok: true, data: [] };
            });
            await svc.execute("ipc.db.get-images-by-stack", { stackId: 3, options: { limit: 2 } });
            assert.deepEqual(seen, [{ stackId: 3, options: { limit: 2 } }]);
            assert.deepEqual(ipcCallArgs([{ name: "a" }, { name: "b" }], { a: 1 }), [1]);
        });

        it("returns live_unavailable or forwards when the app hooks are not in this process", async () => {
            const bare = new DriftaraService({ statusProbes: probes });
            const r = await bare.execute("ipc.db.get-image-count", {});
            assert.equal(r.code, "live_unavailable");
            assert.equal(r.source, "ipc");

            const down = new DriftaraService({
                statusProbes: probes,
                forwardToLive: async () => {
                    throw new Error("SSE error: connect ECONNREFUSED 127.0.0.1:9373");
                },
            });
            assert.equal((await down.execute("ipc.db.get-image-count", {})).code, "live_unavailable");

            const forwarded: Record<string, unknown>[] = [];
            const up = new DriftaraService({
                statusProbes: probes,
                forwardToLive: async (args) => {
                    forwarded.push(args);
                    return { status: "success", action_id: String(args.action_id), warnings: [] };
                },
            });
            const env = await up.execute("db:get-image-count", {}, { requestId: "rid-1", dryRun: true });
            assert.equal(env.status, "success");
            assert.deepEqual(forwarded, [
                { action_id: "ipc.db.get-image-count", arguments: {}, dry_run: true, confirmed: false, request_id: "rid-1" },
            ]);
            assert.match((env.warnings as string[])[0], /resolved 'db:get-image-count'/);
        });

        it("redacts secrets in results but not the confirm token", async () => {
            const svc = inApp(async () => ({ ok: true, data: { database: { password: "hunter2", host: "h" }, api: { key: "k", apiKey: "x" } } }), {
                runTool: async () => okText('Config (c:/config.json):\n{"database": {"password": "hunter2"}}'),
            });
            const ipc = await svc.execute("ipc.system.get-config", {});
            assert.doesNotMatch(JSON.stringify(ipc.data), /hunter2|"x"/);
            const text = await svc.execute("local.get_electron_config", {});
            assert.doesNotMatch(String(text.data), /hunter2/);
            const dry = await svc.execute("ipc.app.set-gallery-mode", { mode: "db" }, { dryRun: true });
            assert.match(String((dry.data as { confirm_token: string }).confirm_token), /^\d+\.[0-9a-f]{40}$/);
        });

        it("maps a CDP connection failure to live_unavailable and keeps images out of the JSON", async () => {
            const down = new DriftaraService({
                statusProbes: probes,
                runTool: async () => ({ content: [{ type: "text", text: "Error: fetch failed ECONNREFUSED" }], isError: true }),
            });
            assert.equal((await down.execute("live.cdp_screenshot", {})).code, "live_unavailable");
            const up = new DriftaraService({
                statusProbes: probes,
                runTool: async () => ({ content: [{ type: "image", data: "iVBORw0", mimeType: "image/png" }] }),
            });
            const env = await up.execute("live.cdp_screenshot", {});
            assert.equal(env.status, "success");
            assert.deepEqual(env.data, [{ type: "image", mimeType: "image/png", data_length: 7 }]);
            assert.equal(envelopeImages.get(env)?.[0].data, "iVBORw0");
        });

        it("logs write executes without argument values", async () => {
            const lines: string[] = [];
            const orig = console.error;
            console.error = (...a: unknown[]) => lines.push(a.join(" "));
            try {
                await inApp(async () => ({ ok: true })).execute("ipc.backup.set-fleet-identity", { targetPath: "E:/secret-dir", driveOrdinal: 1, fleetSize: 2 }, { confirmed: true, requestId: "r9" });
            } finally {
                console.error = orig;
            }
            assert.equal(lines.length, 1);
            assert.match(lines[0], /^driftara_execute action=ipc\.backup\.set-fleet-identity tier=write request_id=r9 duration_ms=/);
            assert.doesNotMatch(lines[0], /secret-dir/);
        });
    });

    describe("tools", () => {
        it("lists search, resolve, execute plus the deprecated aliases", () => {
            assert.deepEqual(listToolDefs(true).map((t) => t.name), ["search", "resolve", "execute", "dispatch", "sse_status"]);
            assert.deepEqual(listToolDefs(false).map((t) => t.name), ["search", "resolve", "execute"]);
        });

        it("dispatch warns and sse_status runs system.status", async () => {
            const svc = inApp(async () => "pong");
            const d = await callDriftaraTool(svc, "dispatch", { action_id: "ipc.ping" });
            assert.equal(d.status, "success");
            assert.match((d.warnings as string[]).at(-1) ?? "", /dispatch is deprecated; use execute \(driftara\)/);
            const s = await callDriftaraTool(svc, "sse_status", {});
            assert.equal(s.action_id, "system.status");
            assert.equal((s.data as { server: string }).server, "driftara");
            assert.equal((await callDriftaraTool(svc, "execute", {})).code, "validation_error");
            assert.equal((await callDriftaraTool(svc, "nope", {})).code, "unknown_tool");
        });
    });
});

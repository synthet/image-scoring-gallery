/**
 * End to end over a real SSE connection: a stdio-side driftara forwards ipc.* to the live server, which runs
 * it through (fake) Electron hooks and applies the tier policy there.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { DriftaraService } from "./driftara/service.js";
import { resetTokenKeyCache } from "./driftara/policy.js";
import { startGalleryMcpLiveServer, type GalleryLiveServer } from "./liveServer.js";
import { callLiveExecute } from "./utils/liveClient.js";

describe("driftara live forwarding", () => {
    let live: GalleryLiveServer;
    let projectRoot: string;
    const calls: Array<[string, unknown[]]> = [];

    before(async () => {
        process.env.DRIFTARA_TOKEN_SECRET = "test-secret";
        resetTokenKeyCache();
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "driftara-live-"));
        live = await startGalleryMcpLiveServer({
            projectRoot,
            port: 0,
            hooks: {
                invokeIpc: async (channel, args) => {
                    calls.push([channel, args]);
                    return channel === "ping" ? "pong" : { ok: true, data: 42 };
                },
            },
        });
    });

    after(async () => {
        await live.close();
        fs.rmSync(projectRoot, { recursive: true, force: true });
        delete process.env.DRIFTARA_TOKEN_SECRET;
        resetTokenKeyCache();
    });

    const client = () => new DriftaraService({ forwardToLive: (args) => callLiveExecute(args, { url: live.sseUrl, timeoutMs: 10000 }) });

    it("runs a read IPC action in the app process", async () => {
        const env = await client().execute("db:get-image-count", {});
        assert.equal(env.status, "success");
        assert.equal(env.data, 42);
        assert.deepEqual(calls.at(-1), ["db:get-image-count", []]);
    });

    it("applies the write tier on the live side", async () => {
        const before = calls.length;
        const blocked = await client().execute("ipc.app.set-gallery-mode", { mode: "db" });
        assert.equal(blocked.code, "confirmation_required");
        const dry = await client().execute("ipc.app.set-gallery-mode", { mode: "db" }, { dryRun: true });
        assert.equal(dry.dry_run, true);
        assert.equal(calls.length, before);
        const ok = await client().execute("ipc.app.set-gallery-mode", { mode: "db" }, { confirmed: true });
        assert.equal(ok.status, "success");
        assert.deepEqual(calls.at(-1), ["app:set-gallery-mode", ["db"]]);
    });

    it("serves the driftara tools over SSE (deprecated dispatch included)", async () => {
        const env = await callLiveExecute({ action_id: "ipc.ping" }, { url: live.sseUrl });
        assert.equal(env.data, "pong");
        const status = (await fetch(live.sseUrl.replace("/mcp/sse", "/mcp-status")).then((r) => r.json())) as Record<string, unknown>;
        assert.equal(status.serves, "driftara");
        assert.equal(status.ipc_hooks, true);
    });
});

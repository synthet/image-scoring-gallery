import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startGalleryMcpLiveServer } from "./liveServer.js";
import { toolsForMode } from "./createGalleryMcpServer.js";
import { UI_LIVE } from "./names.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
    const liveTools = toolsForMode("live");
    const stdioTools = toolsForMode("stdio");
    assert.ok(liveTools.some((t) => t.name === "cdp_screenshot"));
    assert.ok(liveTools.some((t) => t.name === "gallery_ipc_ping"));
    assert.ok(!stdioTools.some((t) => t.name.startsWith("cdp_")));

    const server = await startGalleryMcpLiveServer({ projectRoot, port: 0 });
    try {
        const resp = await fetch(`${server.sseUrl.replace("/mcp/sse", "")}/mcp-status`);
        assert.equal(resp.status, 200);
        const body = (await resp.json()) as { server: string };
        assert.equal(body.server, UI_LIVE);
    } finally {
        await server.close();
    }
    console.log("liveServer smoke test OK");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

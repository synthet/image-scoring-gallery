#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createGalleryCompactMcpServer } from "./createGalleryCompactMcpServer.js";
import { DISPATCH, SEARCH, UI_MCP } from "./names.js";

async function main() {
    process.env.MCP_TOOL_PROFILE = "compact";
    const { server, toolDefs } = createGalleryCompactMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${UI_MCP} MCP v2.3.0 (${SEARCH}, ${DISPATCH})`);
    console.error(`Tools: ${toolDefs.map((t) => t.name).join(", ")}`);
}

main().catch((error) => {
    console.error("Fatal error running gallery compact MCP:", error);
    process.exit(1);
});

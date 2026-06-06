#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createGalleryRouterMcpServer } from "./router/createRouterMcpServer.js";
import { UI_ROUTER } from "./names.js";

async function main() {
    const { server, toolDefs } = createGalleryRouterMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${UI_ROUTER} MCP v2.3.0`);
    console.error(`Tools: ${toolDefs.map((t) => t.name).join(", ")}`);
}

main().catch((error) => {
    console.error("Fatal error running gallery router MCP:", error);
    process.exit(1);
});

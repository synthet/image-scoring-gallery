#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createGalleryMcpServer } from "./createGalleryMcpServer.js";

async function main() {
    const { server, toolDefs } = createGalleryMcpServer({ mode: "stdio" });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("image-scoring-gallery-stdio MCP v2.2.0");
    console.error(`Tools: ${toolDefs.map((t) => t.name).join(", ")}`);
}

main().catch((error) => {
    console.error("Fatal error running stdio MCP:", error);
    process.exit(1);
});

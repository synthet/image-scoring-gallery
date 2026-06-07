#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createGalleryMcpServer } from "./createGalleryMcpServer.js";
import { serverForProfile } from "./names.js";

async function main() {
    process.env.MCP_TOOL_PROFILE = "local";
    const { server, toolDefs, profile } = createGalleryMcpServer({ profile: "local" });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${serverForProfile(profile)} MCP v2.3.0`);
    console.error(`Tools: ${toolDefs.map((t) => t.name).join(", ")}`);
}

main().catch((error) => {
    console.error("Fatal error running gallery local MCP:", error);
    process.exit(1);
});

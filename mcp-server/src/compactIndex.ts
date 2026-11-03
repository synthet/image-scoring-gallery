#!/usr/bin/env node
/** DEPRECATED entry point (is-ui-mcp): starts driftara (search, resolve, execute) under the old server name. See docs/technical/DRIFTARA_MCP.md */
import { runDeprecatedShim } from "./driftara.js";
import { UI_MCP } from "./names.js";

runDeprecatedShim(UI_MCP, "dist/compactIndex.js").catch((error) => {
    console.error("Fatal error running driftara (via dist/compactIndex.js):", error);
    process.exit(1);
});

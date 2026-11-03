#!/usr/bin/env node
/** DEPRECATED entry point (full profile): starts driftara (search, resolve, execute) under the old server name. See docs/technical/DRIFTARA_MCP.md */
import { runDeprecatedShim } from "./driftara.js";
import { UI_FULL } from "./names.js";

runDeprecatedShim(UI_FULL, "dist/index.js").catch((error) => {
    console.error("Fatal error running driftara (via dist/index.js):", error);
    process.exit(1);
});

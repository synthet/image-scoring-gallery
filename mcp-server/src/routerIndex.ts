#!/usr/bin/env node
/** DEPRECATED entry point (is-ui-router): starts driftara (search, resolve, execute) under the old server name. See docs/technical/DRIFTARA_MCP.md */
import { runDeprecatedShim } from "./driftara.js";
import { UI_ROUTER } from "./names.js";

runDeprecatedShim(UI_ROUTER, "dist/routerIndex.js").catch((error) => {
    console.error("Fatal error running driftara (via dist/routerIndex.js):", error);
    process.exit(1);
});

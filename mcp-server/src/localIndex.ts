#!/usr/bin/env node
/** DEPRECATED entry point (is-ui-local): starts driftara (search, resolve, execute) under the old server name. See docs/technical/DRIFTARA_MCP.md */
import { runDeprecatedShim } from "./driftara.js";
import { UI_LOCAL } from "./names.js";

runDeprecatedShim(UI_LOCAL, "dist/localIndex.js").catch((error) => {
    console.error("Fatal error running driftara (via dist/localIndex.js):", error);
    process.exit(1);
});

#!/usr/bin/env node
/** DEPRECATED entry point (is-ui-api): starts driftara (search, resolve, execute) under the old server name. See docs/technical/DRIFTARA_MCP.md */
import { runDeprecatedShim } from "./driftara.js";
import { UI_API } from "./names.js";

runDeprecatedShim(UI_API, "dist/apiIndex.js").catch((error) => {
    console.error("Fatal error running driftara (via dist/apiIndex.js):", error);
    process.exit(1);
});

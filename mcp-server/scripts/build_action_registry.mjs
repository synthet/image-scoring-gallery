/**
 * Regenerate mcp-server/action_registry.json from tool defs + actions/overlay.json.
 * Run: npm run build && node scripts/build_action_registry.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { apiToolDefs } from "../dist/tools/api.js";
import { cdpToolDefs } from "../dist/tools/cdp.js";
import { coreToolDefs } from "../dist/tools/core.js";
import { createLiveIpcToolDefs } from "../dist/tools/liveIpc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overlayPath = path.join(__dirname, "../actions/overlay.json");
const outPath = path.join(__dirname, "../action_registry.json");

const overlay = JSON.parse(fs.readFileSync(overlayPath, "utf-8"));

const HANDLER_DOMAIN = {
    local: "local",
    api: "api",
    live: "live_cdp",
};

function liveHandlerDomain(name) {
    if (name === "gallery_window_status" || name === "gallery_ipc_ping") return "live_ipc";
    return "live_cdp";
}

function metaForTool(name) {
    const cfg = overlay.actions[name];
    if (!cfg) throw new Error(`overlay missing action: ${name}`);
    return cfg;
}

function makeAction(def, domain) {
    const meta = metaForTool(def.name);
    const handlerDomain =
        domain === "live" ? liveHandlerDomain(def.name) : (HANDLER_DOMAIN[domain] ?? domain);
    return {
        action_id: `${domain}.${def.name}`,
        title: meta.title ?? def.name,
        description: def.description,
        category: domain,
        tags: meta.tags ?? [],
        aliases: meta.aliases ?? [],
        intent_examples: meta.intent_examples ?? [],
        side_effect_level: "read_only",
        confirmation_required: false,
        dry_run_supported: false,
        dispatch_enabled: true,
        version: 1,
        deprecated: false,
        input_schema: { ...def.inputSchema, additionalProperties: false },
        legacy_tool_name: def.name,
        handler_domain: handlerDomain,
    };
}

const actions = [];
for (const def of coreToolDefs) actions.push(makeAction(def, "local"));
for (const def of apiToolDefs) actions.push(makeAction(def, "api"));
for (const def of cdpToolDefs) actions.push(makeAction(def, "live"));
for (const def of createLiveIpcToolDefs()) actions.push(makeAction(def, "live"));

actions.sort((a, b) => a.action_id.localeCompare(b.action_id));

const categories = {};
for (const a of actions) {
    categories[a.category] = (categories[a.category] ?? 0) + 1;
}

const registry = {
    version: 1,
    repo: "gallery",
    field_weights: overlay.field_weights ?? {
        action_id: 4.0,
        title: 3.0,
        aliases: 2.5,
        tags: 2.0,
        intent_examples: 2.5,
        description: 1.0,
        argument_names: 1.5,
    },
    categories,
    actions,
};

fs.writeFileSync(outPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Wrote ${outPath} (${actions.length} actions)`);

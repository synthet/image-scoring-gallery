import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ActionRecord, ActionRegistry } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, "../../action_registry.json");

let cached: ActionRegistry | null = null;

export function loadActionRegistry(): ActionRegistry {
    if (!cached) {
        cached = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")) as ActionRegistry;
    }
    return cached;
}

export function registryActions(reg?: ActionRegistry): ActionRecord[] {
    const actions = (reg ?? loadActionRegistry()).actions ?? [];
    return actions.filter((a) => a.dispatch_enabled && !a.deprecated);
}

export function actionById(actionId: string, reg?: ActionRegistry): ActionRecord | undefined {
    return (reg ?? loadActionRegistry()).actions.find((a) => a.action_id === actionId);
}

export function requireAction(actionId: string): ActionRecord {
    const record = actionById(actionId);
    if (!record) {
        throw new Error(`Unknown action: ${actionId}`);
    }
    return record;
}

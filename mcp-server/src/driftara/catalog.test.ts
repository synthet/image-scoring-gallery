import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { loadCatalog } from "./catalog.js";
import { SOURCES } from "./types.js";

const MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ELECTRON_DIR = path.resolve(MCP_ROOT, "..", "electron");

/** Independent of the generator's TypeScript scan: a plain regex over electron/ sources. */
function scanChannels(): string[] {
    const files = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) return files(p);
            return e.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(e.name) && !e.name.endsWith(".d.ts") ? [p] : [];
        });
    const out: string[] = [];
    for (const f of files(ELECTRON_DIR)) {
        const text = fs.readFileSync(f, "utf-8");
        for (const m of text.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)) out.push(m[1]);
        if (/ipcMain\.handle\(\s*channel\b/.test(text)) {
            for (const t of text.matchAll(/for \(const \[channel[^\]]*\] of \[([\s\S]*?)\] as const\)/g)) {
                for (const c of t[1].matchAll(/\[\s*'([^']+)'/g)) out.push(c[1]);
            }
        }
    }
    return out;
}

describe("driftara catalog", () => {
    const catalog = loadCatalog();
    const overrides = JSON.parse(fs.readFileSync(path.join(MCP_ROOT, "driftara", "overrides.json"), "utf-8")) as {
        ipc: Record<string, { tier?: string }>;
    };

    it("loads with unique ids and known sources and tiers", () => {
        const ids = catalog.actions.map((a) => a.action_id);
        assert.equal(new Set(ids).size, ids.length);
        for (const a of catalog.actions) {
            assert.ok((SOURCES as readonly string[]).includes(a.source), a.action_id);
            assert.ok(["read", "write", "destructive"].includes(a.tier), a.action_id);
            assert.equal(a.input_schema.type, "object", a.action_id);
        }
    });

    it("has exactly one ipc.* record per ipcMain.handle channel", () => {
        const channels = scanChannels();
        assert.ok(channels.length >= 100, `expected ~110 channels, scanned ${channels.length}`);
        for (const channel of channels) {
            const matches = catalog.actions.filter((a) => a.executor.kind === "ipc" && a.executor.channel === channel);
            assert.equal(matches.length, 1, `channel ${channel}`);
            assert.ok(matches[0].action_id.startsWith("ipc."), channel);
        }
        const ipcRecords = catalog.actions.filter((a) => a.executor.kind === "ipc");
        assert.equal(ipcRecords.length, new Set(channels).size);
    });

    it("every channel has an explicit, reviewed tier in overrides.json", () => {
        for (const channel of scanChannels()) {
            assert.ok(overrides.ipc[channel]?.tier, `overrides.ipc['${channel}'].tier missing`);
        }
    });

    it("every action id of the old registry still resolves", () => {
        const registry = JSON.parse(fs.readFileSync(path.join(MCP_ROOT, "action_registry.json"), "utf-8")) as {
            actions: Array<{ action_id: string; legacy_tool_name: string }>;
        };
        assert.equal(registry.actions.length, 20);
        for (const a of registry.actions) {
            assert.equal(catalog.resolveId(a.action_id)?.action_id, a.action_id);
            assert.equal(catalog.resolveId(a.legacy_tool_name)?.action_id, a.action_id, a.legacy_tool_name);
        }
    });

    it("resolves raw channels, suffixes and legacy names", () => {
        assert.equal(catalog.resolveId("db:get-images")?.action_id, "ipc.db.get-images");
        assert.equal(catalog.resolveId("cdp_screenshot")?.action_id, "live.cdp_screenshot");
        assert.equal(catalog.resolveId("sse_status")?.action_id, "system.status");
        assert.equal(catalog.resolveId("verify-target")?.action_id, "ipc.backup.verify-target");
        assert.equal(catalog.resolveId("nope.nothing"), undefined);
    });

    it("tier matrix for the reviewed high-risk channels", () => {
        const tier = (id: string) => catalog.get(id)?.tier;
        for (const id of [
            "ipc.db.delete-image",
            "ipc.db.delete-folder",
            "ipc.db.rebuild-stack-cache",
            "ipc.backup.run",
            "ipc.sync.run",
            "ipc.import.run",
            "ipc.system.save-config",
            "live.cdp_evaluate",
        ]) {
            assert.equal(tier(id), "destructive", id);
        }
        for (const id of ["ipc.db.update-image-details", "ipc.backup.set-fleet-identity", "live.cdp_click", "ipc.api.scoring-start"]) {
            assert.equal(tier(id), "write", id);
        }
        for (const id of ["ipc.db.get-images", "ipc.backup.preview", "ipc.sync.preview", "local.gallery_status", "system.status"]) {
            assert.equal(tier(id), "read", id);
        }
    });

    it("generated IPC schemas carry the handler and preload types", () => {
        const getImages = catalog.get("ipc.db.get-images")!;
        const options = (getImages.input_schema.properties as Record<string, { type?: string }>).options;
        assert.equal(options.type, "object");
        const byStack = catalog.get("ipc.db.get-images-by-stack")!;
        assert.deepEqual(byStack.executor.kind === "ipc" && byStack.executor.params, [{ keys: ["stackId", "options"] }]);
        assert.equal(byStack.input_schema.additionalProperties, false);
    });
});

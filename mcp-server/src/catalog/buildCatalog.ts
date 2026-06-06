import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { coreToolDefs } from "../tools/core.js";
import { apiToolDefs } from "../tools/api.js";
import { cdpToolDefs } from "../tools/cdp.js";
import { createLiveIpcToolDefs } from "../tools/liveIpc.js";
import { serverForProfile } from "../names.js";

export interface CatalogOverlay {
    version?: number;
    repo?: string;
    field_weights?: Record<string, number>;
    domains?: Record<string, { server?: string }>;
    tools?: Record<
        string,
        {
            domain?: string;
            tags?: string[];
            examples?: string[];
            risk?: string;
        }
    >;
}

export interface ToolCatalogEntry {
    name: string;
    repo: string;
    domain: string;
    server: string;
    description: string;
    tags: string[];
    examples: string[];
    risk: string;
    args_summary: string;
}

export interface ToolCatalog {
    version: number;
    repo: string;
    field_weights: Record<string, number>;
    domains: Record<string, { server: string; tool_count: number }>;
    profile_tools: Record<string, string[]>;
    tools: ToolCatalogEntry[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY_PATH = path.join(__dirname, "../../tool_catalog_overlay.json");

function loadOverlay(): CatalogOverlay {
    const raw = fs.readFileSync(OVERLAY_PATH, "utf-8");
    return JSON.parse(raw) as CatalogOverlay;
}

function argsSummary(inputSchema: Record<string, unknown>): string {
    const props = (inputSchema.properties ?? {}) as Record<string, unknown>;
    const required = (inputSchema.required ?? []) as string[];
    const parts = Object.keys(props).map((k) => {
        const req = required.includes(k) ? k : `${k}?`;
        return req;
    });
    return parts.length ? `(${parts.join(", ")})` : "()";
}

function allToolDefs() {
    return [
        ...coreToolDefs,
        ...apiToolDefs,
        ...cdpToolDefs,
        ...createLiveIpcToolDefs(),
    ];
}

export function buildGalleryCatalog(): ToolCatalog {
    const overlay = loadOverlay();
    const domainsCfg = overlay.domains ?? {};
    const toolsCfg = overlay.tools ?? {};
    const repo = overlay.repo ?? "gallery";
    const fieldWeights = overlay.field_weights ?? {
        name: 3.0,
        tags: 2.0,
        description: 1.0,
        examples: 2.0,
    };

    const entries: ToolCatalogEntry[] = [];
    const missing: string[] = [];

    for (const def of allToolDefs()) {
        const meta = toolsCfg[def.name];
        if (!meta?.domain) {
            missing.push(def.name);
            continue;
        }
        const domainInfo = domainsCfg[meta.domain] ?? {};
        entries.push({
            name: def.name,
            repo,
            domain: meta.domain,
            server: domainInfo.server ?? serverForProfile(meta.domain),
            description: def.description,
            tags: [...(meta.tags ?? [])],
            examples: [...(meta.examples ?? [])],
            risk: meta.risk ?? "read_only",
            args_summary: argsSummary(def.inputSchema),
        });
    }

    if (missing.length) {
        throw new Error(`Overlay missing domain for tools: ${missing.join(", ")}`);
    }

    const profileTools: Record<string, string[]> = {};
    for (const entry of entries) {
        profileTools[entry.domain] ??= [];
        profileTools[entry.domain].push(entry.name);
    }
    for (const names of Object.values(profileTools)) {
        names.sort();
    }

    const fullNames = entries.map((e) => e.name).sort();
    profileTools.full = fullNames;

    return {
        version: overlay.version ?? 1,
        repo,
        field_weights: fieldWeights,
        domains: Object.fromEntries(
            Object.keys(domainsCfg)
                .sort()
                .map((domain) => [
                    domain,
                    {
                        server: domainsCfg[domain]?.server ?? serverForProfile(domain),
                        tool_count: profileTools[domain]?.length ?? 0,
                    },
                ]),
        ),
        profile_tools: profileTools,
        tools: entries.sort((a, b) => a.name.localeCompare(b.name)),
    };
}

export function catalogPath(): string {
    return path.join(__dirname, "../../tool_catalog.json");
}

export function loadGalleryCatalog(): ToolCatalog {
    const p = catalogPath();
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ToolCatalog;
}

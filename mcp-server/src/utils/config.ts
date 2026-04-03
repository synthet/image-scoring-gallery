import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from utils/
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const ENVIRONMENT_PATH = path.join(PROJECT_ROOT, "environment.json");

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
): Record<string, unknown> {
    const out = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (isRecord(value) && isRecord(out[key])) {
            out[key] = deepMerge(out[key] as Record<string, unknown>, value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

async function readMergedJson(): Promise<Record<string, unknown>> {
    let base: Record<string, unknown> = {};
    try {
        const raw = await fs.readFile(CONFIG_PATH, "utf-8");
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed)) base = parsed;
    } catch {
        /* missing or invalid */
    }
    let env: Record<string, unknown> = {};
    try {
        const raw = await fs.readFile(ENVIRONMENT_PATH, "utf-8");
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed)) env = parsed;
    } catch {
        /* missing or invalid */
    }
    return deepMerge(base, env);
}

async function getMergedMtime(): Promise<number> {
    let max = 0;
    try {
        max = Math.max(max, (await fs.stat(CONFIG_PATH)).mtimeMs);
    } catch {
        /* */
    }
    try {
        max = Math.max(max, (await fs.stat(ENVIRONMENT_PATH)).mtimeMs);
    } catch {
        /* */
    }
    return max;
}

function resolveImageScoringRoot(): string {
    const gallerySibling = path.resolve(PROJECT_ROOT, "..");
    const candidates = [
        path.join(gallerySibling, "image-scoring-backend"),
        path.join(gallerySibling, "image-scoring"),
    ];
    for (const c of candidates) {
        if (fsSync.existsSync(c)) return c;
    }
    return candidates[0];
}

const IMAGE_SCORING_ROOT = resolveImageScoringRoot();

export interface AppConfig {
    database?: {
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        path?: string;
    };
    api?: { url?: string };
    dev?: { url?: string };
    firebird?: { path?: string };
    selection?: Record<string, unknown>;
}

let cachedConfig: AppConfig | null = null;
let configMtime = 0;

export async function readConfig(): Promise<AppConfig> {
    try {
        const mtime = await getMergedMtime();
        if (cachedConfig !== null && mtime === configMtime) {
            return cachedConfig;
        }

        const merged = await readMergedJson();
        cachedConfig = merged as AppConfig;
        configMtime = mtime;
        return cachedConfig!;
    } catch {
        return {};
    }
}

export function getConfigPath(): string {
    return CONFIG_PATH;
}

export function getEnvironmentPath(): string {
    return ENVIRONMENT_PATH;
}

/**
 * Discover the API backend URL.
 * Priority: merged config (config.json + environment.json) → lock file → default.
 */
export async function resolveApiUrl(): Promise<string> {
    // 1. Check merged config
    const config = await readConfig();
    if (config.api?.url) return config.api.url;

    // 2. Check lock files for port
    for (const lockName of ["webui-debug.lock", "webui.lock"]) {
        try {
            const lockPath = path.join(IMAGE_SCORING_ROOT, lockName);
            const content = await fs.readFile(lockPath, "utf-8");
            const port = content.trim().split("\n")[0]?.trim();
            if (port && /^\d+$/.test(port)) {
                return `http://127.0.0.1:${port}`;
            }
        } catch {
            // Lock file doesn't exist, try next
        }
    }

    // 3. Default
    return "http://127.0.0.1:7860";
}

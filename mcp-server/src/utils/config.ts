import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from utils/
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");

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
        const stat = await fs.stat(CONFIG_PATH);
        if (cachedConfig && stat.mtimeMs === configMtime) return cachedConfig;

        const raw = await fs.readFile(CONFIG_PATH, "utf-8");
        cachedConfig = JSON.parse(raw);
        configMtime = stat.mtimeMs;
        return cachedConfig!;
    } catch {
        return {};
    }
}

export function getConfigPath(): string {
    return CONFIG_PATH;
}

/**
 * Discover the API backend URL.
 * Priority: config.json → lock file → default.
 */
export async function resolveApiUrl(): Promise<string> {
    // 1. Check config.json
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

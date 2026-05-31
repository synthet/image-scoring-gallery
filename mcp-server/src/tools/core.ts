import fs from "fs/promises";
import path from "path";
import os from "os";

import { collectGalleryStatus } from "../utils/capabilities.js";
import { readConfig, getConfigPath } from "../utils/config.js";

export interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface ToolResult {
    [key: string]: unknown;
    content: { type: string; text?: string; data?: string; mimeType?: string }[];
    isError?: boolean;
}

const APPDATA =
    process.env.APPDATA ||
    (process.platform === "darwin"
        ? process.env.HOME + "/Library/Application Support"
        : process.env.HOME + "/.config");
const LOGS_DIR = path.join(APPDATA, "electron-gallery");

async function getLatestLogFile(): Promise<string | null> {
    try {
        const files = await fs.readdir(LOGS_DIR);
        const logFiles = files.filter((f) => f.startsWith("session_") && f.endsWith(".log"));
        if (logFiles.length === 0) return null;
        logFiles.sort((a, b) => b.localeCompare(a));
        return path.join(LOGS_DIR, logFiles[0]);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
    }
}

export const coreToolDefs: ToolDef[] = [
    {
        name: "get_electron_logs",
        description: "Read the latest Electron app session logs. Optionally specify lines to read.",
        inputSchema: {
            type: "object",
            properties: {
                lines: {
                    type: "number",
                    description: "Number of lines from the end of the file to return (default 100).",
                },
            },
        },
    },
    {
        name: "get_electron_config",
        description: "Read the config.json file from the root of the Electron project.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "get_system_stats",
        description:
            "Get system stats (CPU, memory, uptime). Does not probe network; use gallery_status for API/CDP reachability.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "gallery_status",
        description:
            "Probe capabilities: python_api (FastAPI /api/health via resolved backend URL) and electron_cdp (DevTools /json). Use first to see whether api_* vs cdp_* tools are likely to work.",
        inputSchema: { type: "object", properties: {} },
    },
];

export async function handleCoreTool(
    name: string,
    args: Record<string, unknown>,
): Promise<ToolResult> {
    if (name === "get_electron_logs") {
        const logFile = await getLatestLogFile();
        if (!logFile) {
            return { content: [{ type: "text", text: `No log files found in ${LOGS_DIR}` }] };
        }
        const content = await fs.readFile(logFile, "utf-8");
        const lines = content.split("\n");
        const numLines = (args?.lines as number) || 100;
        const tailLines = lines.slice(-numLines).join("\n");
        return {
            content: [{ type: "text", text: `Last ${numLines} lines of ${logFile}:\n...\n${tailLines}` }],
        };
    }

    if (name === "get_electron_config") {
        const configPath = getConfigPath();
        try {
            const config = await readConfig();
            return {
                content: [{ type: "text", text: `Config (${configPath}):\n${JSON.stringify(config, null, 2)}` }],
            };
        } catch {
            return { content: [{ type: "text", text: `No config.json found at: ${configPath}` }] };
        }
    }

    if (name === "get_system_stats") {
        const stats = {
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemoryGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
            freeMemoryGB: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
            uptimeSeconds: Math.floor(os.uptime()),
        };
        return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    }

    if (name === "gallery_status") {
        const status = await collectGalleryStatus();
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    }

    throw new Error(`Unknown core tool: ${name}`);
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const LOCK_FILENAME = "gallery-mcp.lock";
const DEFAULT_SSE_URL = "http://127.0.0.1:9373/mcp/sse";

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_SSE_READ_TIMEOUT_MS = 10000;

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function defaultHeaders(): Record<string, string> {
    const token = process.env.GALLERY_MCP_TOKEN?.trim();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
}

function readLockSseUrl(): string | null {
    const lockPath = path.join(PROJECT_ROOT, LOCK_FILENAME);
    try {
        const raw = fs.readFileSync(lockPath, "utf-8");
        const payload = JSON.parse(raw) as { sse_url?: string };
        const url = payload.sse_url?.trim();
        return url || null;
    } catch {
        return null;
    }
}

export function resolveLiveSseUrl(): string {
    const fromEnv = process.env.GALLERY_LIVE_MCP_SSE_URL?.trim();
    if (fromEnv) return fromEnv;
    return readLockSseUrl() ?? DEFAULT_SSE_URL;
}

function extractToolPayload(result: unknown): unknown {
    if (!result || typeof result !== "object") return result;
    const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
    if (Array.isArray(content) && content.length > 0) {
        const first = content[0];
        if (first.type === "text" && first.text) {
            const text = first.text.trim();
            if (
                (text.startsWith("{") && text.endsWith("}")) ||
                (text.startsWith("[") && text.endsWith("]"))
            ) {
                try {
                    return JSON.parse(text);
                } catch {
                    return { text: first.text };
                }
            }
            return { text: first.text };
        }
    }
    return result;
}

export async function probeLiveMcp(
    url = resolveLiveSseUrl(),
    headers = defaultHeaders(),
): Promise<{ ok: boolean; url: string; error: string | null }> {
    const transport = new SSEClientTransport(new URL(url), {
        requestInit: { headers },
    });
    const client = new Client({ name: "is-ui-mcp-probe", version: "2.3.0" });
    try {
        await withTimeout(
            client.connect(transport),
            DEFAULT_TIMEOUT_MS,
            `Live MCP connection timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        );
        return { ok: true, url, error: null };
    } catch (err) {
        return {
            ok: false,
            url,
            error: err instanceof Error ? err.message : String(err),
        };
    } finally {
        await client.close().catch(() => undefined);
    }
}

export async function callLiveTool(
    name: string,
    args: Record<string, unknown>,
    options: {
        url?: string;
        headers?: Record<string, string>;
        timeoutMs?: number;
    } = {},
): Promise<unknown> {
    const url = options.url ?? resolveLiveSseUrl();
    const headers = options.headers ?? defaultHeaders();
    const transport = new SSEClientTransport(new URL(url), {
        requestInit: { headers },
    });
    const client = new Client({ name: "is-ui-mcp-proxy", version: "2.3.0" });
    const timeoutMs = options.timeoutMs ?? DEFAULT_SSE_READ_TIMEOUT_MS;

    try {
        await withTimeout(
            client.connect(transport),
            DEFAULT_TIMEOUT_MS,
            `Live MCP connection timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        );
        const result = await withTimeout(
            client.callTool({ name, arguments: args }),
            timeoutMs,
            `Live MCP call '${name}' timed out after ${timeoutMs}ms`,
        );
        return extractToolPayload(result);
    } finally {
        await client.close().catch(() => undefined);
    }
}

export async function callLiveDispatch(
    dispatchArgs: Record<string, unknown>,
    options: { url?: string; headers?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
    const payload = await callLiveTool("dispatch", dispatchArgs, options);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        return payload as Record<string, unknown>;
    }
    return {
        status: "success",
        action_id: String(dispatchArgs.action_id ?? ""),
        request_id: dispatchArgs.request_id ? String(dispatchArgs.request_id) : undefined,
        data: payload,
    };
}

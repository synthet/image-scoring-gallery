import http from "node:http";
import { URL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import getRawBody from "raw-body";

import { createGalleryMcpServer } from "./createGalleryMcpServer.js";
import type { GalleryLiveHooks } from "./tools/liveIpc.js";
import { UI_LIVE } from "./names.js";

const DEFAULT_PORT = 9373;
const LOCK_FILENAME = "gallery-mcp.lock";

export interface GalleryLiveServerOptions {
    port?: number;
    projectRoot: string;
    hooks?: GalleryLiveHooks;
}

export interface GalleryLiveServer {
    port: number;
    sseUrl: string;
    close: () => Promise<void>;
}

function checkAuth(req: http.IncomingMessage): boolean {
    const expected = process.env.GALLERY_MCP_TOKEN?.trim();
    if (!expected) return true;
    const header = req.headers.authorization ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    return bearer === expected;
}

function unauthorized(res: http.ServerResponse): void {
    res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Unauthorized");
}

async function writeLockFile(projectRoot: string, payload: Record<string, unknown>): Promise<string> {
    const lockPath = path.join(projectRoot, LOCK_FILENAME);
    await fs.writeFile(lockPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    return lockPath;
}

async function removeLockFile(projectRoot: string): Promise<void> {
    const lockPath = path.join(projectRoot, LOCK_FILENAME);
    try {
        await fs.unlink(lockPath);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
}

export async function startGalleryMcpLiveServer(
    options: GalleryLiveServerOptions,
): Promise<GalleryLiveServer> {
    const { projectRoot, hooks = {} } = options;
    const requestedPort = options.port ?? DEFAULT_PORT;

    const transports = new Map<
        string,
        { transport: SSEServerTransport; mcpServer: ReturnType<typeof createGalleryMcpServer>["server"] }
    >();

    const httpServer = http.createServer(async (req, res) => {
        try {
            if (!req.url) {
                res.writeHead(400).end("Bad request");
                return;
            }

            const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);

            if (req.method === "GET" && url.pathname === "/mcp/sse") {
                if (!checkAuth(req)) {
                    unauthorized(res);
                    return;
                }

                const { server: sessionServer } = createGalleryMcpServer({ mode: "live", hooks });
                const transport = new SSEServerTransport("/mcp/messages", res);
                transports.set(transport.sessionId, { transport, mcpServer: sessionServer });
                // Session cleanup only — do not call sessionServer.close() here.
                // Protocol.connect() wraps onclose; server.close() → transport.close() → onclose again (stack overflow).
                transport.onclose = () => {
                    transports.delete(transport.sessionId);
                };

                await sessionServer.connect(transport);
                return;
            }

            if (req.method === "POST" && url.pathname === "/mcp/messages") {
                if (!checkAuth(req)) {
                    unauthorized(res);
                    return;
                }

                const sessionId = url.searchParams.get("sessionId");
                if (!sessionId) {
                    res.writeHead(400).end("Missing sessionId");
                    return;
                }

                const session = transports.get(sessionId);
                if (!session) {
                    res.writeHead(404).end("Unknown session");
                    return;
                }

                const body = await getRawBody(req, { limit: "4mb", encoding: "utf-8" });
                const parsed = body ? JSON.parse(body) : undefined;
                await session.transport.handlePostMessage(req, res, parsed);
                return;
            }

            if (req.method === "GET" && url.pathname === "/mcp-status") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        server: UI_LIVE,
                        expected_sse_url: `http://127.0.0.1:${boundPort}/mcp/sse`,
                    }),
                );
                return;
            }

            res.writeHead(404).end("Not found");
        } catch (error) {
            console.error("[gallery-live-mcp]", error);
            if (!res.headersSent) {
                res.writeHead(500).end("Internal server error");
            }
        }
    });

    let boundPort = requestedPort;

    await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(requestedPort, "127.0.0.1", () => {
            const addr = httpServer.address();
            if (addr && typeof addr === "object" && addr.port) {
                boundPort = addr.port;
            }
            resolve();
        });
    });

    const sseUrl = `http://127.0.0.1:${boundPort}/mcp/sse`;
    await writeLockFile(projectRoot, {
        port: boundPort,
        sse_url: sseUrl,
        pid: process.pid,
        started_at: new Date().toISOString(),
    });

    console.error(`[gallery-live-mcp] SSE at ${sseUrl}`);

    return {
        port: boundPort,
        sseUrl,
        close: async () => {
            for (const session of [...transports.values()]) {
                await session.mcpServer.close().catch(() => undefined);
            }
            transports.clear();
            await new Promise<void>((resolve, reject) => {
                httpServer.close((err) => (err ? reject(err) : resolve()));
            });
            await removeLockFile(projectRoot);
        },
    };
}

/** Standalone entry (testing): node dist/liveServer.js */
async function main() {
    const projectRoot = process.env.GALLERY_PROJECT_ROOT ?? path.resolve(process.cwd(), "..");
    const port = parseInt(process.env.GALLERY_MCP_PORT ?? String(DEFAULT_PORT), 10);
    const live = await startGalleryMcpLiveServer({ projectRoot, port });
    process.on("SIGINT", () => {
        void live.close().finally(() => process.exit(0));
    });
}

const entryScript = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectRun = entryScript === fileURLToPath(import.meta.url);

if (isDirectRun) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

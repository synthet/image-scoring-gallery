import { getCdpBaseUrl } from "../utils/capabilities.js";
import { sendCdpCommand, findPageTarget } from "../utils/cdp.js";

interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

interface ToolResult {
    [key: string]: unknown;
    content: { type: string; text?: string; data?: string; mimeType?: string }[];
    isError?: boolean;
}

export const cdpToolDefs: ToolDef[] = [
    {
        name: "cdp_screenshot",
        description:
            "Requires electron_cdp (gallery_status). Screenshot via CDP; PNG image. Dev Electron with remote debugging (default 9222; override ELECTRON_CDP_URL / ELECTRON_REMOTE_DEBUGGING_PORT).",
        inputSchema: {
            type: "object",
            properties: {
                fullPage: {
                    type: "boolean",
                    description: "Capture the full scrollable page instead of just the viewport (default false).",
                },
            },
        },
    },
    {
        name: "cdp_evaluate",
        description:
            "Requires electron_cdp. Run JS in the renderer page context; inspect DOM/state.",
        inputSchema: {
            type: "object",
            properties: {
                expression: {
                    type: "string",
                    description: "JavaScript expression to evaluate in the page context.",
                },
            },
            required: ["expression"],
        },
    },
    {
        name: "cdp_console_logs",
        description:
            "Requires electron_cdp. Collect renderer console output for duration_ms (default 2000, max 10000).",
        inputSchema: {
            type: "object",
            properties: {
                duration_ms: {
                    type: "number",
                    description: "How long to listen for console messages in milliseconds (default 2000, max 10000).",
                },
            },
        },
    },
];

export async function handleCdpTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
        if (name === "cdp_screenshot") {
            const result = (await sendCdpCommand("Page.captureScreenshot", {
                format: "png",
                captureBeyondViewport: args?.fullPage === true,
            })) as { data: string };

            return {
                content: [
                    { type: "image", data: result.data, mimeType: "image/png" },
                ],
            };
        }

        if (name === "cdp_evaluate") {
            const expression = args?.expression as string;
            if (!expression) {
                return { content: [{ type: "text", text: "Error: 'expression' parameter is required" }], isError: true };
            }

            const result = (await sendCdpCommand("Runtime.evaluate", {
                expression,
                returnByValue: true,
                awaitPromise: true,
            })) as {
                result: { type: string; value?: unknown; description?: string; subtype?: string };
                exceptionDetails?: { text: string; exception?: { description?: string } };
            };

            if (result.exceptionDetails) {
                const errMsg = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
                return { content: [{ type: "text", text: `JS Error: ${errMsg}` }], isError: true };
            }

            const value = result.result.value;
            const text = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? result.result.description ?? "undefined");
            return { content: [{ type: "text", text }] };
        }

        if (name === "cdp_console_logs") {
            const duration = Math.min((args?.duration_ms as number) || 2000, 10000);

            // Enable console, collect messages, then disable
            const target = await findPageTarget();
            const wsUrl = target.webSocketDebuggerUrl!;
            const messages: string[] = [];

            await new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(wsUrl);
                let nextId = 1;
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve();
                }, duration);

                ws.addEventListener("open", () => {
                    ws.send(JSON.stringify({ id: nextId++, method: "Console.enable" }));
                    ws.send(JSON.stringify({ id: nextId++, method: "Runtime.enable" }));
                });

                ws.addEventListener("message", (event) => {
                    const data = JSON.parse(String(event.data));
                    if (data.method === "Runtime.consoleAPICalled") {
                        const args = data.params.args?.map((a: { value?: unknown; description?: string }) =>
                            a.value !== undefined ? JSON.stringify(a.value) : (a.description || "")
                        ).join(" ");
                        messages.push(`[${data.params.type}] ${args}`);
                    } else if (data.method === "Console.messageAdded") {
                        const msg = data.params.message;
                        messages.push(`[${msg.level}] ${msg.text}`);
                    }
                });

                ws.addEventListener("error", () => {
                    clearTimeout(timeout);
                    reject(new Error("CDP WebSocket error"));
                });
            });

            if (messages.length === 0) {
                return { content: [{ type: "text", text: `No console messages captured in ${duration}ms` }] };
            }
            return { content: [{ type: "text", text: messages.join("\n") }] };
        }

        throw new Error(`Unknown CDP tool: ${name}`);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("WebSocket")) {
            const cdp = getCdpBaseUrl();
            return {
                content: [{
                    type: "text",
                    text: `Electron CDP is not reachable at ${cdp}. Run the gallery in dev with remote debugging (or set ELECTRON_CDP_URL / ELECTRON_REMOTE_DEBUGGING_PORT).\nError: ${msg}`,
                }],
                isError: true,
            };
        }
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
}

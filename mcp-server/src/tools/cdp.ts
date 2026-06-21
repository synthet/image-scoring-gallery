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

type MouseButton = "left" | "middle" | "right";

function err(text: string): ToolResult {
    return { content: [{ type: "text", text }], isError: true };
}

function okText(text: string): ToolResult {
    return { content: [{ type: "text", text }] };
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
    const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : fallback;
    return Math.max(min, Math.min(max, v));
}

async function evalJson<T>(expression: string): Promise<T> {
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
        throw new Error(`JS Error: ${errMsg}`);
    }
    return result.result.value as T;
}

async function getSelectorInfo(selector: string): Promise<{
    exists: boolean;
    visible: boolean;
    box: { x: number; y: number; width: number; height: number } | null;
    text: string | null;
}> {
    // Avoid JSON/string injection by passing through JSON.stringify.
    const sel = JSON.stringify(selector);
    const expr = `
(() => {
  const el = document.querySelector(${sel});
  if (!el) return { exists: false, visible: false, box: null, text: null };
  const r = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const visible =
    r.width > 0 && r.height > 0 &&
    style && style.visibility !== 'hidden' && style.display !== 'none' &&
    style.opacity !== '0';
  const text = (el instanceof HTMLElement) ? (el.innerText || el.textContent || '') : (el.textContent || '');
  return {
    exists: true,
    visible,
    box: { x: r.left, y: r.top, width: r.width, height: r.height },
    text: String(text).slice(0, 5000),
  };
})()
`.trim();
    return await evalJson(expr);
}

async function focusSelector(selector: string): Promise<void> {
    const sel = JSON.stringify(selector);
    const expr = `
(() => {
  const el = document.querySelector(${sel});
  if (!el) return { ok: false, reason: 'not_found' };
  if (el instanceof HTMLElement && typeof el.focus === 'function') el.focus();
  return { ok: true };
})()
`.trim();
    const r = await evalJson<{ ok: boolean; reason?: string }>(expr);
    if (!r.ok) throw new Error(`Selector not found: ${selector}`);
}

async function clickSelector(selector: string, button: MouseButton, clickCount: number): Promise<void> {
    const info = await getSelectorInfo(selector);
    if (!info.exists || !info.box) throw new Error(`Selector not found: ${selector}`);
    const x = info.box.x + info.box.width / 2;
    const y = info.box.y + info.box.height / 2;

    // Best effort: ensure focus before click.
    await focusSelector(selector).catch(() => undefined);

    await sendCdpCommand("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button,
        clickCount,
    });
    await sendCdpCommand("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button,
        clickCount,
    });
}

async function pressKey(key: string): Promise<void> {
    // Minimal keypress: keyDown + keyUp. (text will be handled by insertText path)
    await sendCdpCommand("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
    });
    await sendCdpCommand("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
    });
}

async function insertText(text: string): Promise<void> {
    // Prefer Input.insertText when available in the target.
    await sendCdpCommand("Input.insertText", { text });
}

async function fillSelector(selector: string, value: string, clear: boolean): Promise<void> {
    const sel = JSON.stringify(selector);
    const val = JSON.stringify(value);
    const expr = `
(() => {
  const el = document.querySelector(${sel});
  if (!el) return { ok: false, reason: 'not_found' };
  const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  if (!isInput) return { ok: false, reason: 'not_fillable' };
  el.focus();
  const prototype = el instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : HTMLTextAreaElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!valueSetter) return { ok: false, reason: 'missing_value_setter' };
  if (${clear ? "true" : "false"}) valueSetter.call(el, '');
  valueSetter.call(el, ${val});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
})()
`.trim();
    const r = await evalJson<{ ok: boolean; reason?: string }>(expr);
    if (!r.ok) {
        if (r.reason === "not_found") throw new Error(`Selector not found: ${selector}`);
        if (r.reason === "not_fillable") throw new Error(`Element is not an <input>/<textarea>: ${selector}`);
        if (r.reason === "missing_value_setter") throw new Error(`Element has no native value setter: ${selector}`);
        throw new Error(`Failed to fill selector: ${selector}`);
    }
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
    {
        name: "cdp_query_selector",
        description: "Requires electron_cdp. Query selector existence/visibility and bounding box (viewport CSS pixels).",
        inputSchema: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector to query (document.querySelector)." },
            },
            required: ["selector"],
        },
    },
    {
        name: "cdp_click",
        description: "Requires electron_cdp. Click the center of a selector via CDP Input.dispatchMouseEvent.",
        inputSchema: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector to click." },
                button: { type: "string", description: "Mouse button: left|middle|right (default left)." },
                clickCount: { type: "number", description: "Click count (default 1, max 3)." },
            },
            required: ["selector"],
        },
    },
    {
        name: "cdp_press",
        description: "Requires electron_cdp. Press a key (keyDown + keyUp).",
        inputSchema: {
            type: "object",
            properties: {
                key: { type: "string", description: "Key name, e.g. Enter, Escape, ArrowLeft." },
            },
            required: ["key"],
        },
    },
    {
        name: "cdp_type",
        description: "Requires electron_cdp. Type text into the currently focused element (best-effort).",
        inputSchema: {
            type: "object",
            properties: {
                text: { type: "string", description: "Text to type via CDP Input.insertText." },
            },
            required: ["text"],
        },
    },
    {
        name: "cdp_fill",
        description: "Requires electron_cdp. Focus an <input>/<textarea>, set value, dispatch input/change.",
        inputSchema: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector for an <input> or <textarea>." },
                value: { type: "string", description: "Value to set." },
                clear: { type: "boolean", description: "If true, clear before setting (default false)." },
            },
            required: ["selector", "value"],
        },
    },
    {
        name: "cdp_wait_for",
        description: "Requires electron_cdp. Wait for selector to be attached or visible.",
        inputSchema: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector to wait for." },
                state: { type: "string", description: "attached|visible (default visible)." },
                timeout_ms: { type: "number", description: "Timeout in ms (default 5000, max 60000)." },
                poll_ms: { type: "number", description: "Polling interval in ms (default 100, min 50, max 1000)." },
            },
            required: ["selector"],
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
                return err("Error: 'expression' parameter is required");
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
                return err(`JS Error: ${errMsg}`);
            }

            const value = result.result.value;
            const text = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? result.result.description ?? "undefined");
            return okText(text);
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
                return okText(`No console messages captured in ${duration}ms`);
            }
            return okText(messages.join("\n"));
        }

        if (name === "cdp_query_selector") {
            const selector = String(args?.selector ?? "").trim();
            if (!selector) return err("Error: 'selector' parameter is required");
            const info = await getSelectorInfo(selector);
            return okText(JSON.stringify(info, null, 2));
        }

        if (name === "cdp_click") {
            const selector = String(args?.selector ?? "").trim();
            if (!selector) return err("Error: 'selector' parameter is required");
            const buttonRaw = String(args?.button ?? "left") as MouseButton;
            const button: MouseButton = (buttonRaw === "middle" || buttonRaw === "right" || buttonRaw === "left") ? buttonRaw : "left";
            const clickCount = clampInt(args?.clickCount, 1, 3, 1);
            await clickSelector(selector, button, clickCount);
            return okText(JSON.stringify({ ok: true }, null, 2));
        }

        if (name === "cdp_press") {
            const key = String(args?.key ?? "").trim();
            if (!key) return err("Error: 'key' parameter is required");
            await pressKey(key);
            return okText(JSON.stringify({ ok: true }, null, 2));
        }

        if (name === "cdp_type") {
            const text = String(args?.text ?? "");
            // allow empty string (no-op)
            if (!text) return okText(JSON.stringify({ ok: true, typed: 0 }, null, 2));
            await insertText(text);
            return okText(JSON.stringify({ ok: true, typed: text.length }, null, 2));
        }

        if (name === "cdp_fill") {
            const selector = String(args?.selector ?? "").trim();
            if (!selector) return err("Error: 'selector' parameter is required");
            const value = String(args?.value ?? "");
            const clear = args?.clear === true;
            await fillSelector(selector, value, clear);
            return okText(JSON.stringify({ ok: true }, null, 2));
        }

        if (name === "cdp_wait_for") {
            const selector = String(args?.selector ?? "").trim();
            if (!selector) return err("Error: 'selector' parameter is required");
            const stateRaw = String(args?.state ?? "visible").trim();
            const state = stateRaw === "attached" ? "attached" : "visible";
            const timeoutMs = clampInt(args?.timeout_ms, 0, 60000, 5000);
            const pollMs = clampInt(args?.poll_ms, 50, 1000, 100);
            const start = Date.now();
            while (true) {
                const info = await getSelectorInfo(selector);
                const ok = state === "attached" ? info.exists : (info.exists && info.visible);
                if (ok) {
                    return okText(JSON.stringify({ ok: true, state, elapsed_ms: Date.now() - start }, null, 2));
                }
                if (Date.now() - start >= timeoutMs) {
                    return err(`Timeout waiting for selector (${state}): ${selector}`);
                }
                await new Promise((r) => setTimeout(r, pollMs));
            }
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
        return err(`Error: ${msg}`);
    }
}

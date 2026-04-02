import { getCdpBaseUrl } from "./capabilities.js";

interface CdpTarget {
    id: string;
    type: string;
    title: string;
    url: string;
    webSocketDebuggerUrl?: string;
}

/**
 * Discover available CDP targets from the Electron dev server.
 */
export async function listTargets(): Promise<CdpTarget[]> {
    const resp = await fetch(`${getCdpBaseUrl()}/json`, { signal: AbortSignal.timeout(3000) });
    return (await resp.json()) as CdpTarget[];
}

/**
 * Find the first page-type target.
 */
export async function findPageTarget(): Promise<CdpTarget> {
    const targets = await listTargets();
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("No page target found. Is the Electron app running?");
    if (!page.webSocketDebuggerUrl) throw new Error("Target has no WebSocket URL");
    return page;
}

/**
 * Send a single CDP command and return the result.
 * Opens a WebSocket, sends the command, waits for response, closes.
 */
export async function sendCdpCommand(
    method: string,
    params: Record<string, unknown> = {}
): Promise<unknown> {
    const target = await findPageTarget();
    const wsUrl = target.webSocketDebuggerUrl!;

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const id = 1;
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`CDP command '${method}' timed out after 10s`));
        }, 10000);

        ws.addEventListener("open", () => {
            ws.send(JSON.stringify({ id, method, params }));
        });

        ws.addEventListener("message", (event) => {
            const data = JSON.parse(String(event.data));
            if (data.id === id) {
                clearTimeout(timeout);
                ws.close();
                if (data.error) {
                    reject(new Error(`CDP error: ${data.error.message}`));
                } else {
                    resolve(data.result);
                }
            }
        });

        ws.addEventListener("error", (err) => {
            clearTimeout(timeout);
            reject(new Error(`CDP WebSocket error: ${err}`));
        });
    });
}

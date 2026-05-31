import type { ToolDef, ToolResult } from "./core.js";

export interface GalleryLiveHooks {
    getWindowStatus?: () => Promise<Record<string, unknown>>;
}

export function createLiveIpcToolDefs(): ToolDef[] {
    return [
        {
            name: "gallery_window_status",
            description:
                "Requires image-scoring-gallery-live (Electron running). Main window visibility, bounds, and focus state from the Electron main process.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "gallery_ipc_ping",
            description:
                "Requires image-scoring-gallery-live. Round-trip ping from MCP live server through Electron main process hooks.",
            inputSchema: { type: "object", properties: {} },
        },
    ];
}

export async function handleLiveIpcTool(
    name: string,
    _args: Record<string, unknown>,
    hooks: GalleryLiveHooks,
): Promise<ToolResult> {
    if (name === "gallery_window_status") {
        if (!hooks.getWindowStatus) {
            return {
                content: [
                    {
                        type: "text",
                        text: "gallery_window_status requires Electron main-process hooks (image-scoring-gallery-live SSE).",
                    },
                ],
                isError: true,
            };
        }
        const status = await hooks.getWindowStatus();
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    }

    if (name === "gallery_ipc_ping") {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(
                        {
                            ok: true,
                            transport: "image-scoring-gallery-live",
                            pid: process.pid,
                            timestamp: new Date().toISOString(),
                        },
                        null,
                        2,
                    ),
                },
            ],
        };
    }

    throw new Error(`Unknown live IPC tool: ${name}`);
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import type { ToolDef } from "./tools/core.js";
import { coreToolDefs, handleCoreTool } from "./tools/core.js";
import { apiToolDefs, handleApiTool } from "./tools/api.js";
import { cdpToolDefs, handleCdpTool } from "./tools/cdp.js";
import {
    createLiveIpcToolDefs,
    handleLiveIpcTool,
    type GalleryLiveHooks,
} from "./tools/liveIpc.js";
import { serverForProfile } from "./names.js";

export type GalleryMcpMode = "stdio" | "live";
export type GalleryMcpProfile = "local" | "api" | "full" | "live";

export interface CreateGalleryMcpServerOptions {
    mode?: GalleryMcpMode;
    profile?: Exclude<GalleryMcpProfile, "live">;
    hooks?: GalleryLiveHooks;
}

function toolNames(defs: ToolDef[]): Set<string> {
    return new Set(defs.map((t) => t.name));
}

export function toolsForMode(mode: GalleryMcpMode): ToolDef[] {
    if (mode === "stdio") {
        return [...coreToolDefs, ...apiToolDefs];
    }
    return [...cdpToolDefs, ...createLiveIpcToolDefs()];
}

export function toolsForProfile(profile: Exclude<GalleryMcpProfile, "live">): ToolDef[] {
    switch (profile) {
        case "local":
            return [...coreToolDefs];
        case "api":
            return [...apiToolDefs];
        case "full":
            return [...coreToolDefs, ...apiToolDefs];
    }
}

export function createGalleryMcpServer(options: CreateGalleryMcpServerOptions = {}): {
    server: Server;
    toolDefs: ToolDef[];
    profile: GalleryMcpProfile;
} {
    const { hooks = {} } = options;
    const mode = options.mode ?? "stdio";
    const profile: GalleryMcpProfile =
        mode === "live" ? "live" : (options.profile ?? "full");
    const toolDefs =
        profile === "live" ? toolsForMode("live") : toolsForProfile(profile);

    const mcpServer = new Server(
        {
            name: serverForProfile(profile),
            version: "2.3.0",
        },
        { capabilities: { tools: {} } },
    );

    const coreTools = toolNames(coreToolDefs);
    const apiTools = toolNames(apiToolDefs);
    const cdpTools = toolNames(cdpToolDefs);
    const liveIpcTools = toolNames(createLiveIpcToolDefs());

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefs }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const toolArgs = (args ?? {}) as Record<string, unknown>;

        try {
            if (coreTools.has(name)) return await handleCoreTool(name, toolArgs);
            if (apiTools.has(name)) return await handleApiTool(name, toolArgs);
            if (cdpTools.has(name)) return await handleCdpTool(name, toolArgs);
            if (liveIpcTools.has(name)) return await handleLiveIpcTool(name, toolArgs, hooks);
            throw new Error(`Unknown tool: ${name}`);
        } catch (error: unknown) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
                isError: true,
            };
        }
    });

    return { server: mcpServer, toolDefs, profile };
}

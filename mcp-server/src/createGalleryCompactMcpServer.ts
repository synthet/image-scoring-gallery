import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { searchActions } from "./actions/search.js";
import { DISPATCH, SEARCH, SSE_STATUS, UI_LIVE, UI_MCP } from "./names.js";
import { probeLiveMcp, resolveLiveSseUrl } from "./utils/liveClient.js";
import { dispatchWithLiveProxy } from "./utils/proxyDispatch.js";

interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

const compactToolDefs: ToolDef[] = [
    {
        name: SEARCH,
        description:
            "BM25 search over gallery MCP actions (local, API, live); does not execute side effects.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Natural language intent or keywords." },
                limit: { type: "number", description: "Max results (default 10)." },
                category: {
                    type: "string",
                    description: "Optional filter: local, api, or live.",
                },
                read_only_only: {
                    type: "boolean",
                    description: "When true, omit mutating actions.",
                },
                include_schemas: {
                    type: "boolean",
                    description: "Include full input_schema on each result.",
                },
            },
            required: ["query"],
        },
    },
    {
        name: DISPATCH,
        description: "Execute a gallery action by action_id with schema validation.",
        inputSchema: {
            type: "object",
            properties: {
                action_id: { type: "string", description: "Registry action_id, e.g. local.gallery_status." },
                arguments: { type: "object", description: "Action arguments object." },
                dry_run: { type: "boolean" },
                confirmed: { type: "boolean" },
                request_id: { type: "string" },
                expected_version: { type: "number" },
            },
            required: ["action_id"],
        },
    },
    {
        name: SSE_STATUS,
        description:
            "Read-only probe: whether is-ui-live SSE is reachable (gallery-mcp.lock or default 127.0.0.1:9373).",
        inputSchema: { type: "object", properties: {} },
    },
];

function toolResult(text: string, isError = false) {
    return {
        content: [{ type: "text" as const, text }],
        ...(isError ? { isError: true } : {}),
    };
}

async function handleCompactTool(name: string, args: Record<string, unknown>) {
    if (name === SEARCH) {
        const query = String(args.query ?? "").trim();
        if (!query) {
            return toolResult(JSON.stringify({ error: "query is required" }, null, 2), true);
        }
        const result = searchActions(query, {
            limit: typeof args.limit === "number" ? args.limit : 10,
            category: args.category ? String(args.category) : undefined,
            readOnlyOnly: args.read_only_only === true,
            includeSchemas: args.include_schemas === true,
        });
        return toolResult(JSON.stringify(result, null, 2));
    }

    if (name === DISPATCH) {
        const actionId = String(args.action_id ?? "").trim();
        if (!actionId) {
            return toolResult(JSON.stringify({ error: "action_id is required" }, null, 2), true);
        }
        const result = await dispatchWithLiveProxy(
            actionId,
            (args.arguments ?? {}) as Record<string, unknown>,
            {
                dryRun: args.dry_run === true,
                confirmed: args.confirmed === true,
                requestId: args.request_id ? String(args.request_id) : undefined,
                expectedVersion: typeof args.expected_version === "number" ? args.expected_version : undefined,
            },
        );
        const isError = result.status === "error";
        return toolResult(JSON.stringify(result, null, 2), isError);
    }

    if (name === SSE_STATUS) {
        const probe = await probeLiveMcp();
        return toolResult(
            JSON.stringify(
                {
                    ok: probe.ok,
                    server: UI_LIVE,
                    url: probe.url || resolveLiveSseUrl(),
                    error: probe.error,
                },
                null,
                2,
            ),
        );
    }

    throw new Error(`Unknown compact tool: ${name}`);
}

export function createGalleryCompactMcpServer(): { server: Server; toolDefs: ToolDef[] } {
    const mcpServer = new Server({ name: UI_MCP, version: "2.3.0" }, { capabilities: { tools: {} } });

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: compactToolDefs }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: toolArgs } = request.params;
        try {
            return await handleCompactTool(name, (toolArgs ?? {}) as Record<string, unknown>);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolResult(`Error executing ${name}: ${msg}`, true);
        }
    });

    return { server: mcpServer, toolDefs: compactToolDefs };
}

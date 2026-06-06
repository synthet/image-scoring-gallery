import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { buildGalleryCatalog, loadGalleryCatalog, type ToolCatalogEntry } from "../catalog/buildCatalog.js";
import {
    UI_CARD,
    UI_DOMAINS,
    UI_FIND,
    UI_ROUTER,
} from "../names.js";
import { Bm25Index, formatWhenToUse } from "./bm25.js";

interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

function toolResult(text: string, isError = false) {
    return {
        content: [{ type: "text" as const, text }],
        ...(isError ? { isError: true } : {}),
    };
}

function getCatalog() {
    try {
        return loadGalleryCatalog();
    } catch {
        return buildGalleryCatalog();
    }
}

let index: Bm25Index | null = null;

function getIndex(): Bm25Index {
    if (!index) {
        const cat = getCatalog();
        index = new Bm25Index(cat.tools, cat.field_weights);
    }
    return index;
}

const routerToolDefs: ToolDef[] = [
    {
        name: UI_FIND,
        description:
            "BM25 search over gallery MCP tool cards; returns is-ui-* server keys for dispatch.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Natural language intent or keywords." },
                limit: { type: "number", description: "Max results (default 10, max 50)." },
                domain: { type: "string", description: "Optional filter: local, api, or live." },
                repo: { type: "string", description: "Optional repo filter (gallery)." },
                risk: { type: "string", description: "Optional risk filter." },
            },
            required: ["query"],
        },
    },
    {
        name: UI_DOMAINS,
        description: "List gallery MCP domains, server keys (is-ui-*), and tool counts.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: UI_CARD,
        description: "Return the full tool card for one gallery tool by exact name.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Exact tool name." },
            },
            required: ["name"],
        },
    },
];

function findEntry(name: string): ToolCatalogEntry | undefined {
    return getCatalog().tools.find((t) => t.name === name);
}

async function handleRouterTool(name: string, args: Record<string, unknown>) {
    if (name === UI_FIND) {
        const query = String(args.query ?? "").trim();
        if (!query) return toolResult(JSON.stringify({ error: "query is required" }, null, 2), true);
        const limit = typeof args.limit === "number" ? args.limit : 10;
        const hits = getIndex().search(query, {
            limit,
            domain: args.domain ? String(args.domain) : undefined,
            repo: args.repo ? String(args.repo) : undefined,
            risk: args.risk ? String(args.risk) : undefined,
        });
        const results = hits.map(({ entry, score }) => ({
            name: entry.name,
            server: entry.server,
            domain: entry.domain,
            repo: entry.repo,
            risk: entry.risk,
            score: Math.round(score * 10000) / 10000,
            description: entry.description,
            when_to_use: formatWhenToUse(entry),
        }));
        return toolResult(JSON.stringify({ query, count: results.length, results }, null, 2));
    }

    if (name === UI_DOMAINS) {
        const cat = getCatalog();
        const domains = Object.entries(cat.domains).map(([domain, info]) => ({
            domain,
            server: info.server,
            tool_count: info.tool_count,
        }));
        return toolResult(
            JSON.stringify(
                {
                    repo: cat.repo,
                    domains,
                    hint: `Use ${UI_FIND}(query) then call the tool on the returned server key.`,
                },
                null,
                2,
            ),
        );
    }

    if (name === UI_CARD) {
        const toolName = String(args.name ?? "").trim();
        const entry = findEntry(toolName);
        if (!entry) {
            return toolResult(
                JSON.stringify(
                    {
                        error: `Unknown tool: ${toolName}`,
                        hint: `Use ${UI_FIND} with a natural language query.`,
                    },
                    null,
                    2,
                ),
                true,
            );
        }
        return toolResult(
            JSON.stringify({ tool: entry, when_to_use: formatWhenToUse(entry) }, null, 2),
        );
    }

    throw new Error(`Unknown router tool: ${name}`);
}

export function createGalleryRouterMcpServer(): { server: Server; toolDefs: ToolDef[] } {
    const mcpServer = new Server(
        { name: UI_ROUTER, version: "2.3.0" },
        { capabilities: { tools: {} } },
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: routerToolDefs }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: toolArgs } = request.params;
        try {
            return await handleRouterTool(name, (toolArgs ?? {}) as Record<string, unknown>);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolResult(`Error executing ${name}: ${msg}`, true);
        }
    });

    return { server: mcpServer, toolDefs: routerToolDefs };
}

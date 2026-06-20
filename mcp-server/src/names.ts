/** Short MCP server and router tool names (is- = image scoring, ui = gallery/desktop UI). */

export const UI_MCP = "is-ui-mcp";
export const UI_ROUTER = "is-ui-router";
export const UI_LOCAL = "is-ui-local";
export const UI_API = "is-ui-api";
export const UI_LIVE = "is-ui-live";
export const UI_FULL = "is-ui-full";

export const UI_FIND = "ui_find";
export const UI_DOMAINS = "ui_domains";
export const UI_CARD = "ui_card";

export const SEARCH = "search";
export const DISPATCH = "dispatch";
export const SSE_STATUS = "sse_status";

export const PROFILE_SERVER: Record<string, string> = {
    mcp: UI_MCP,
    local: UI_LOCAL,
    api: UI_API,
    live: UI_LIVE,
    full: UI_FULL,
    router: UI_ROUTER,
    compact: UI_MCP,
};

export function serverForProfile(profile: string): string {
    return PROFILE_SERVER[profile] ?? `is-ui-${profile}`;
}

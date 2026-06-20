---
type: Guide
title: Compact MCP server (is-ui-mcp)
description: Gallery Node stdio MCP (search, dispatch, sse_status), CDP live actions, SSE proxy, and multi-root Cursor setup.
resource: docs/guides/05-mcp-compact-servers.md
tags: [mcp, agents, cursor, gallery-docs, electron]
timestamp: 2026-06-20T00:00:00Z
okf_version: 0.1
---

# Compact MCP server (is-ui-mcp)

Driftara Gallery exposes **`is-ui-mcp`** — a Node stdio MCP server with the same compact tools as the backend:

| Tool | Purpose |
|------|---------|
| **`search`** | BM25 over `mcp-server/action_registry.json` |
| **`dispatch`** | Run `local.*`, `api.*`, or `live.*` actions |
| **`sse_status`** | Probe whether **`is-ui-live`** SSE is reachable |

Cross-repo contract (envelopes, naming): backend [MCP_SEARCH_DISPATCH.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/MCP_SEARCH_DISPATCH.md). Full setup matrix (both repos): backend [mcp-compact-servers.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/guides/setup/mcp-compact-servers.md).

## Setup

1. Copy [`.cursor/mcp.example.json`](../../.cursor/mcp.example.json) → `.cursor/mcp.json`.
2. Build: `cd mcp-server && npm install && npm run build:registry`
3. Reload MCP in Cursor.

```json
{
  "mcpServers": {
    "is-ui-mcp": {
      "command": "node",
      "args": ["mcp-server/dist/compactIndex.js"],
      "cwd": "${workspaceFolder:image-scoring-gallery}"
    }
  }
}
```

In a multi-root workspace, folder names must match `image-scoring-backend.code-workspace` (see backend setup guide).

## Live / CDP actions

When Electron dev is running (`npm run dev`), optional **`is-ui-live`** SSE at `http://127.0.0.1:9373/mcp/sse` (see `gallery-mcp.lock`). Stdio **`is-ui-mcp`** can proxy **`live_ipc`** actions when SSE is up; **`live.cdp_*`** actions use CDP directly when remote debugging is enabled.

Playwright-like helpers (via `dispatch`):

- `live.cdp_query_selector`, `live.cdp_click`, `live.cdp_type`, `live.cdp_fill`, `live.cdp_press`, `live.cdp_wait_for`

Discover with `search("click selector")`.

## Verification

```text
sse_status()                           → is-ui-live reachability
search("gallery status")               → local.gallery_status, etc.
dispatch("local.gallery_status", dry_run=true)
```

## Other agents (Claude Code, Antigravity, Codex)

Copy repo examples into local config (gitignored):

| Agent | Gallery | Backend (browser automation) |
|-------|---------|------------------------------|
| **Claude Code** | [`.mcp.json.example`](../../.mcp.json.example) | sibling [`.mcp.json.example`](https://github.com/synthet/image-scoring-backend/blob/main/.mcp.json.example) |
| **Antigravity** | [`mcp_config.example.json`](../../mcp_config.example.json) | sibling [`mcp_config.example.json`](https://github.com/synthet/image-scoring-backend/blob/main/mcp_config.example.json) |
| **Codex** | [`.codex/config.example.toml`](../../.codex/config.example.toml) | sibling [`.codex/config.example.toml`](https://github.com/synthet/image-scoring-backend/blob/main/.codex/config.example.toml) |

**Browser automation** (`browser.navigate`, `browser.snapshot`, …) lives on **`is-be-mcp`** only — no separate Playwright MCP key. Claude permissions: [`.claude/settings.json.example`](../../.claude/settings.json.example).

## Related

- [AGENTS.md](../../AGENTS.md) — MCP keys and workflow
- [02-api-backend-config.md](02-api-backend-config.md) — backend URL discovery
- [technical/AGENT_COORDINATION.md](../technical/AGENT_COORDINATION.md) — cross-repo pointer
- [LESSONS_LEARNED.md](../LESSONS_LEARNED.md) — MCP debugging notes

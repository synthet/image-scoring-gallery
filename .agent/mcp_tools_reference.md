# MCP Tools Quick Reference — Driftara Gallery

Router-first dispatch. Catalog: `mcp-server/tool_catalog.json`.

## Server keys

| Key | Use |
|-----|-----|
| **`is-ui-router`** | **`ui_find`**, `ui_domains`, `ui_card` |
| **`is-ui-local`** | `gallery_status`, logs, config |
| **`is-ui-api`** | `api_health`, `api_*` (backend WebUI up) |
| **`is-ui-live`** | `cdp_*`, `gallery_window_status`, `gallery_ipc_ping` |
| **`is-be-mcp`** | Sibling backend: **`search`**, **`dispatch`** (preferred for pipeline triage) |

Backend compact contract: [MCP_SEARCH_DISPATCH.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/MCP_SEARCH_DISPATCH.md). Full backend catalog: [AGENTS.md](https://github.com/synthet/image-scoring-backend/blob/main/AGENTS.md).

## Read-only triage

1. **`is-ui-router`** → **`ui_find("gallery status")`** or **`is-ui-local`** → **`gallery_status`**
2. **`is-ui-api`** → `api_health`
3. Sibling backend **`is-be-mcp`**: `search("connection error")` → `dispatch("diagnostics.validate_config", {})`
4. **`is-ui-live`** → `cdp_console_logs` when Electron running

## High-risk

Writes and `execute_code` live on **`is-be-maint`** / **`is-be-webui`** (backend). Keep disabled in automated profiles.

## Agent config files

| Tool | Project MCP file |
|------|------------------|
| **Cursor** | [`.cursor/mcp.json`](../.cursor/mcp.json) |
| **Claude Code** | [`.mcp.json`](../.mcp.json) if present |

Build: `cd mcp-server && npm install && npm run build`.

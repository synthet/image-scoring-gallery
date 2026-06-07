---
name: image-scoring-mcp
description: Driftara Gallery MCP — is-ui-* router-first; backend triage via sibling is-be-mcp search+dispatch.
---

# Gallery MCP

Catalog: [`mcp-server/tool_catalog.json`](../../../mcp-server/tool_catalog.json). Reference: [mcp_tools_reference.md](../../mcp_tools_reference.md).

## Server keys

| Key | Tools |
|-----|-------|
| **`is-ui-router`** | `ui_find`, `ui_domains`, `ui_card` |
| **`is-ui-local`** | `gallery_status`, `get_electron_logs`, config |
| **`is-ui-api`** | `api_health`, `api_*` |
| **`is-ui-live`** | `cdp_*`, `gallery_window_status` |
| **`is-be-mcp`** (sibling backend) | **`search`**, **`dispatch`** — preferred for pipeline/DB triage |

Do not use `imgscore-el-*`, `image-scoring-gallery-*`, `image-scoring-backend-*`.

## Workflows

### Gallery startup / backend connection

1. **`is-ui-local`** → **`gallery_status`**
2. **`is-ui-api`** → **`api_health`**
3. Backend deep dive → sibling **`is-be-mcp`**: `search("scoring errors")` → `dispatch("diagnostics.get_error_summary", {})`

### Unknown tool

**`is-ui-router`** → **`ui_find(query)`** → call tool on returned server.

## execute_code

Backend only: **`is-be-webui`** + `ENABLE_MCP_EXECUTE_CODE=1`.

Backend compact contract: [MCP_SEARCH_DISPATCH.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/MCP_SEARCH_DISPATCH.md).

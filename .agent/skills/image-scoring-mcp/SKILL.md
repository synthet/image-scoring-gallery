---
name: image-scoring-mcp
description: How to use the gallery MCP server plus the optional backend DB MCP for diagnostics, API probing, and renderer inspection.
---

# Image Scoring MCP Server

The gallery workspace now has two distinct MCP paths:

- **Primary gallery MCP:** **`imgscore-el-gallery`** (Node stdio, `mcp-server/dist/index.js`)
- **Optional full DB MCP:** **`imgscore-el-stdio`** (Python `modules.mcp_server`, disabled by default in the gallery repo)

Use the gallery MCP first. Only switch to the Python DB MCP when you need direct database diagnostics such as `query_images` or `execute_sql`.

## Start Here

1. Run **`gallery_status`**.
   - This tells you whether **`python_api`** is reachable for **`api_*`** tools.
   - This tells you whether **`electron_cdp`** is reachable for **`cdp_*`** tools.
2. Use the always-available local gallery tools for config/log/system inspection.
3. Use **`api_*`** only when `gallery_status.python_api.reachable` is true.
4. Use **`cdp_*`** only when `gallery_status.electron_cdp.reachable` is true.
5. If you need SQL/image DB diagnostics, enable **`imgscore-el-stdio`** or open the backend workspace.

## Gallery MCP Tools (`imgscore-el-gallery`)

### Local Diagnostics

| Tool | Purpose |
|------|---------|
| `gallery_status` | Probe FastAPI + Electron CDP reachability before choosing `api_*` or `cdp_*` |
| `get_electron_logs` | Read the latest Electron session log |
| `get_electron_config` | Read the gallery `config.json` |
| `get_system_stats` | Inspect local machine CPU/memory/uptime |

### FastAPI Probes

Use these only when `gallery_status.python_api.reachable` is true.

| Tool | Purpose |
|------|---------|
| `api_health` | Combined `/api/health` + `/api/status` snapshot |
| `api_job_status` | Recent jobs or a specific job/run |
| `api_run_stages` | Stage breakdown for a run/job id |
| `api_probe` | Timed GET against an arbitrary backend-relative path |
| `api_runner_status` | Scoring/tagging/clustering runner state |

### Electron CDP Tools

Use these only when `gallery_status.electron_cdp.reachable` is true.

| Tool | Purpose |
|------|---------|
| `cdp_screenshot` | Capture the Electron renderer as a PNG |
| `cdp_evaluate` | Run JS in the renderer page context |
| `cdp_console_logs` | Collect renderer console output for a short window |

## Optional Full DB MCP (`imgscore-el-stdio`)

This server points at sibling **`image-scoring-backend`** and is disabled by default in `.cursor/mcp.json`.

```json
"imgscore-el-stdio": {
    "command": "python",
    "args": ["-m", "modules.mcp_server"],
    "cwd": "d:\\Projects\\image-scoring-backend",
    "env": { "PYTHONPATH": "d:\\Projects\\image-scoring-backend" },
    "disabled": true
}
```

When disabled, its tools are unavailable unless the user enables the server or uses the backend workspace (`imgscore-py-stdio`).

Use it for:

- `query_images`
- `get_image_details`
- `execute_sql`
- `check_database_health`
- `get_model_status`

## Common Workflows

### 1. Decide which MCP path to use

```text
1. gallery_status
2. If python_api.reachable -> use api_*
3. If electron_cdp.reachable -> use cdp_*
4. If you need SQL/image DB internals -> enable imgscore-el-stdio
```

### 2. Inspect backend job state from the gallery workspace

```text
1. gallery_status
2. api_health
3. api_job_status or api_run_stages
4. api_runner_status
```

### 3. Inspect live renderer/UI state

```text
1. gallery_status
2. cdp_console_logs
3. cdp_evaluate
4. cdp_screenshot
```

### 4. Deep database debugging (optional backend MCP)

```text
1. Enable imgscore-el-stdio or open backend workspace
2. check_database_health
3. query_images / get_image_details
4. execute_sql if you need exact DB shape
```

For WebUI **`execute_code`**, add **`imgscore-el-sse`** when the WebUI runs (`ENABLE_MCP_EXECUTE_CODE=1` on the WebUI).

# MCP Tools Quick Reference — Driftara Gallery

The gallery interacts with two MCP servers:

- **`imgscore-el-gallery`** (primary, enabled in `.cursor/mcp.json`) — local stdio app built from [`mcp-server/`](../mcp-server/). Read-only by design: logs, `config.json`, `get_system_stats`, `gallery_status`, FastAPI `api_*` probes, Electron `cdp_*` tools when CDP is enabled.
- **`imgscore-el-stdio`** (opt-in) — Python `modules.mcp_server` from sibling `image-scoring-backend`. Exposes full backend diagnostics **including destructive tools**. Disabled by default in this repo.

Backend authoritative catalog: [image-scoring-backend AGENTS.md](https://github.com/synthet/image-scoring-backend/blob/main/AGENTS.md), [.agent/mcp_tools_reference.md](https://github.com/synthet/image-scoring-backend/blob/main/.agent/mcp_tools_reference.md).

## Read-only diagnostics profile (preferred)

Use these tools for triage. Safe to enable in shared, automated, or background-agent profiles.

### From `imgscore-el-gallery`

| Tool | Purpose |
|------|---------|
| `gallery_status` | One-shot reachability: FastAPI URL/port, Electron CDP, `webui.lock` discovery. **Always start here.** |
| `get_electron_config` | Effective `config.json` (redacted) |
| `get_electron_logs` | Tail Electron main + renderer logs |
| `get_system_stats` | Host CPU / RAM / disk |
| `api_health`, `api_probe`, `api_runner_status`, `api_job_status` | Reach backend REST without leaving the IDE |
| `cdp_console_logs`, `cdp_evaluate`, `cdp_screenshot` | Renderer inspection when `ELECTRON_REMOTE_DEBUGGING_PORT=9222` is set |

### From `imgscore-el-stdio` (opt-in)

| Tool | Purpose |
|------|---------|
| `validate_config` | Backend config sanity |
| `verify_environment` | Backend env + GPU + ML deps |
| `get_database_engine_info` | PostgreSQL vs API mode info |
| `check_database_health` | pgvector + integrity check |
| `get_error_summary` | Job failures, missing scores |
| `get_failed_images` | Drill into failed image rows |
| `get_db_schema` | Live DDL from backend |
| `search_logs`, `get_server_log_tail`, `read_debug_log` | Backend log triage |
| `get_job_details`, `get_job_phases`, `get_recent_jobs`, `get_run_diagnostics` | Pipeline run inspection |
| `export_debug_bundle` | Redacted support bundle — review before sharing |

## High-risk write tools — disable by default

These tools mutate state (DB, filesystem, runners) or execute code. **Never** enable in shared, automated, or background-agent profiles. Require explicit user-in-the-loop intent and a recent backup.

From `imgscore-el-stdio`:

| Tool | Why it's risky |
|------|----------------|
| `execute_code` | Arbitrary code execution in WebUI process. Only when `ENABLE_MCP_EXECUTE_CODE=1` on backend SSE. |
| `execute_sql` | Direct DB writes; trivial to corrupt schema or data |
| `set_config_value` | Mutates backend `config.json` live |
| `run_processing_job` | Spawns pipeline runs that consume GPU / mutate rows |
| `process_newly_imported_folders` | Bulk side effects on import |
| `rebase_file_paths` | Mass-mutates `file_path` across `images` rows |
| `prune_missing_files` | Deletes DB rows for unreachable files — irreversible without backup |
| `set_image_metadata` | Mass-mutates rating / label / keywords |
| `propagate_tags` | Bulk tag changes across stacks |
| `manage_runners` | Starts/stops job runners |

## Live-host warnings

- **`imgscore-el-sse`** (WebUI SSE bridge, e.g. for `execute_code`) runs inside the live FastAPI process. Any failure cascades to live users hitting `/api/*`. Avoid on shared hosts.
- The optional `imgscore-el-stdio` server spawns a Python process from sibling backend; ensure no stale FastAPI is running on the same DB before invoking write tools.

## Quick triage flow

1. `gallery_status` — what's reachable?
2. `api_health` / `api_probe` — backend up?
3. `get_electron_logs` / `get_server_log_tail` — recent errors?
4. `check_database_health` / `get_error_summary` (if backend MCP enabled) — DB or job failures?
5. Only after read-only triage points to a clear cause should writes be considered — and then only with the user's explicit go-ahead, per [.agent/SAFETY.md](SAFETY.md).

## Pointers

- Slash commands: [`.claude/commands/`](../.claude/commands/) (mirror of `.cursor/commands/`).
- Subagents (Cursor / Claude): [`.cursor/agents/`](../.cursor/agents/), mirrored under `.claude/agents/`. Logical role map: [subagents/README.md](subagents/README.md).
- Backend authority for tool counts and schemas: backend [AGENTS.md](https://github.com/synthet/image-scoring-backend/blob/main/AGENTS.md). If counts diverge, backend wins — file an issue.

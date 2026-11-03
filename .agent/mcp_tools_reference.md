# MCP Tools Quick Reference — Driftara Gallery

One server, **`driftara`**: `search` → `resolve` → `execute` over one catalog (`mcp-server/driftara/catalog.json`). Contract: [docs/technical/DRIFTARA_MCP.md](../docs/technical/DRIFTARA_MCP.md). Architecture: [docs/architecture/03-driftara-mcp.md](../docs/architecture/03-driftara-mcp.md).

## Server keys

| Key | Use |
|-----|-----|
| **`driftara`** | All gallery actions: `local.*` probes, `ipc.*` (every Electron IPC channel), `live.cdp_*` renderer automation, `api.*` backend-connection probes, `system.*` |
| **`is-be-mcp`** (vexlum) | Sibling backend: REST, SQL, jobs, diagnostics. driftara never does backend work; it points you to vexlum. Contract: [VEXLUM_MCP.md](https://github.com/synthet/image-scoring-pipeline/blob/main/docs/technical/VEXLUM_MCP.md) |

Deprecated: `is-ui-mcp`, `is-ui-router`, `is-ui-local` and `is-ui-api` still start, but they log a warning and serve the driftara tools. The `dispatch` and `sse_status` tools are aliases of `execute`.

## Read-only triage

1. `execute("system.status")`: catalog counts, live server, CDP and backend reachability.
2. `execute("local.gallery_status")`: backend API and Electron CDP probes (no app needed).
3. `search("…")` → `resolve(id)` → `execute(id, args)` for anything else. `ipc.*` and `live.*` need the app running (`npm run dev`); otherwise they return `live_unavailable`.
4. Backend problems: vexlum `search("connection error")` → `execute("diagnostics.validate_config", {})`.

## Tiers (write safety)

| Tier | Run requires |
|------|--------------|
| `read` | nothing |
| `write` | `confirmed=true` |
| `destructive` (deletes, imports, sync, backup, config save, `live.cdp_evaluate`) | `DRIFTARA_ALLOW_ELEVATED=1` in the **app's** environment, a `dry_run=true` that returns `confirm_token`, then `confirmed=true` with that token and the same arguments |

Prefer `dry_run=true` first for anything that isn't `read`. Keep elevation off in automated profiles.

## CLI

`scripts\driftara.cmd status`, `search "…"`, `resolve ID`, `exec ID --args "{…}" [--dry-run] [--confirm] [--token T]`. Use `--json` for raw envelopes. Exit codes: 0 ok, 1 action error, 2 usage error.

## Agent config files

| Tool | Project MCP file |
|------|------------------|
| **Cursor** | Copy [`.cursor/mcp.example.json`](../.cursor/mcp.example.json) → `.cursor/mcp.json` (gitignored) |
| **Claude Code** | Copy [`.mcp.json.example`](../.mcp.json.example) → `.mcp.json` |
| **Antigravity** | [`mcp_config.example.json`](../mcp_config.example.json) |
| **Codex** | [`.codex/config.example.toml`](../.codex/config.example.toml) |

Build: `cd mcp-server && npm install && npm run build`.

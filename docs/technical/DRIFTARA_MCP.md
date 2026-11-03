---
type: "Technical Reference"
title: "driftara — single MCP + CLI entry point"
description: "Contract for driftara, the gallery's one MCP server and CLI: three tools (search, resolve, execute) over one catalog of local probes, every Electron IPC channel, renderer CDP automation and backend connection probes, with tiered write confirmation."
resource: "docs/technical/DRIFTARA_MCP.md"
tags: ["gallery-docs", "technical", "mcp", "agents", "cli"]
timestamp: 2026-11-02T00:00:00Z
okf_version: 0.1
---

# driftara — single MCP + CLI entry point

driftara is the gallery's single MCP server and CLI. It has three tools (search, resolve, execute) over one catalog of every gallery capability, and it follows the same contract as the backend's vexlum, so an agent that knows one knows both.

**Authority:**
- the service in [`mcp-server/src/driftara/`](../../mcp-server/src/driftara/);
- the entry point [`mcp-server/src/driftara.ts`](../../mcp-server/src/driftara.ts);
- the catalog [`mcp-server/driftara/catalog.json`](../../mcp-server/driftara/catalog.json), generated from the IPC handler sources plus [`overrides.json`](../../mcp-server/driftara/overrides.json).

Issue [#236](https://github.com/synthet/image-scoring-gallery/issues/236). How it works inside: [driftara architecture](../architecture/03-driftara-mcp.md). The backend counterpart is [vexlum](https://github.com/synthet/image-scoring-pipeline/blob/main/docs/technical/VEXLUM_MCP.md).

driftara replaces the separate gallery MCP surfaces: `is-ui-mcp`, `is-ui-router`, `is-ui-local`, `is-ui-api`, the full `index.js` profile, and the tool profile of `is-ui-live`. Those still start, but they log a deprecation line and serve the driftara tools. See [Deprecated surfaces](#deprecated-surfaces).

**Backend work belongs to vexlum.** driftara never calls backend REST routes or SQL itself. A search or id that matches no gallery action returns a hint pointing to vexlum. There is no `vexlum.*` passthrough.

## Tools

| Tool | Purpose |
|------|---------|
| **`search(query, limit=10, source?, category?, tier?, include_schemas=false)`** | Ranked catalog search over ids, titles, descriptions, aliases and intent examples. An empty query lists the actions that match the filters. |
| **`resolve(action_id)`** | The full contract for one action: input schema, tier, `requires`, executor, an example call and the equivalent CLI line. Also accepts aliases and legacy names (old `dispatch` ids such as `live.cdp_screenshot`, and IPC channel names). |
| **`execute(action_id, arguments={}, dry_run=false, confirmed=false, confirm_token?, request_id?)`** | Validates the arguments against the schema, applies the [tier policy](#tier-policy) and runs the action. |

The deprecated aliases stay listed unless `DRIFTARA_HIDE_DEPRECATED=1` is set:
- `dispatch` behaves like `execute` and adds a `warnings[]` entry;
- `sse_status` behaves like `execute("system.status")`.

### Workflow

```text
search("is the gallery app running")             -> local.gallery_status, system.status, ...
resolve("ipc.db.get-image-count")                -> schema, tier=read, example
execute("ipc.db.get-image-count", {})
execute("ipc.app.set-gallery-mode", {"mode": "db"}, confirmed=true)
```

Every `execute` returns one envelope with the fields `status`, `action_id`, `request_id`, `source`, `tier`, `dry_run`, `summary`, `data`, `warnings` and `notes`.

Errors return `status: "error"` with a `code` and `details`. The codes:
- `unknown_action` (with `suggestions`, and a vexlum hint for backend intents);
- `validation_error`, `confirmation_required`, `confirm_token_invalid`, and `policy_rejected` (for example a destructive action without `DRIFTARA_ALLOW_ELEVATED=1`);
- `live_unavailable` (the gallery app isn't running) and `live_timeout`;
- `ipc_error` and `handler_error` (the channel or handler failed in the app).

Secret-looking values in results are redacted.

## Catalog sources

| `source` | Action ids | Runs where |
|----------|-----------|------------|
| `ipc` | `ipc.<group>.<channel>` for **every** `ipcMain.handle` channel, for example `ipc.db.get-image-count`, `ipc.import.run` | In the Electron main process, forwarded through the live server. Needs the app running; otherwise `live_unavailable`. |
| `cdp` | `live.cdp_*` (screenshot, click, fill, evaluate, …) | Through Chrome DevTools against the renderer. Needs the app with remote debugging. |
| `local` | `local.gallery_status`, `local.get_electron_config`, `local.get_electron_logs`, `local.get_system_stats` | In the driftara process. No app needed. |
| `api` | `api.api_health`, `api.api_probe`, `api.api_job_status`, `api.api_run_stages`, `api.api_runner_status` | The gallery's own probes of its backend connection (HTTP to the resolved backend URL). Needs only the backend. |
| `system` | `system.status`, `system.categories` | driftara itself. |

The `ipc` records are generated from the `ipcMain.handle` calls in `electron/ipc/register*Handlers.ts` and `electron/main.ts`. Reviewed tiers, aliases, intent examples and notes come from `overrides.json`, and every channel must have a reviewed tier there. CI fails when the catalog, or the block below, no longer matches the sources:

```bash
npm run build:driftara-catalog --prefix mcp-server   # regenerate after adding or changing a channel
npm run check:driftara-catalog --prefix mcp-server   # what CI runs
node mcp-server/scripts/build_driftara_catalog.mjs --update-doc   # refresh the block below
```

<!-- BEGIN DRIFTARA CATALOG -->
_This section is auto-generated by `node mcp-server/scripts/build_driftara_catalog.mjs --update-doc`. Do not edit manually._

Total actions: **133**

| Source | read | write | destructive | Total |
|---|---|---|---|---|
| `api` | 5 | 0 | 0 | 5 |
| `cdp` | 4 | 4 | 1 | 9 |
| `ipc` | 64 | 40 | 9 | 113 |
| `local` | 4 | 0 | 0 | 4 |
| `system` | 2 | 0 | 0 | 2 |
<!-- END DRIFTARA CATALOG -->

Run `driftara exec system.categories` for counts per category.

## Tier policy

| Tier | Examples | Requirement for a real run |
|------|----------|---------------------------|
| `read` | `system.status`, `local.*`, `api.*`, read-only IPC (`ipc.db.get-image-count`), `live.cdp_screenshot` | none |
| `write` | IPC that changes settings or data (`ipc.app.set-gallery-mode`), job and cancel channels, `live.cdp_click`/`fill`/`type` | `confirmed=true` |
| `destructive` | `ipc.db.delete-image`, `ipc.db.delete-folder`, `ipc.import.run`, `ipc.sync.run`, `ipc.backup.run`, `ipc.system.save-config`, `ipc.db.rebuild-stack-cache`, `ipc.api.delete-approved-agent-cull`, `ipc.api.evidence.export-pack`, `live.cdp_evaluate` | env `DRIFTARA_ALLOW_ELEVATED=1` on the process that runs the action, **and** a prior `dry_run=true` that returned `data.confirm_token`, **and** `confirmed=true` with that token and the same arguments |

- **Dry runs.** `dry_run=true` never mutates and is always allowed. For an IPC action it returns the validated arguments and the channel call that would be made.
- **Default tier.** An IPC channel without a reviewed tier is treated as `write`. The Db, NefFs, Backup, Sync and Import channels were reviewed one by one. Anything that deletes or moves files, rewrites DB rows in bulk, or runs arbitrary code is `destructive`.
- **Where the policy runs.** A call from the CLI or the stdio server for an `ipc.*` or `live.*` action is forwarded whole, flags included, to the live server inside the gallery app. The tier check and token check run there, so `DRIFTARA_ALLOW_ELEVATED=1` must be set in the **app's** environment to allow destructive IPC.
- **The confirm token.** `confirm_token` is `<expiry>.<hmac>` over the action id, the canonical arguments and the expiry. It is valid for 10 minutes, and changing any argument invalidates it.
  - The key comes from `DRIFTARA_TOKEN_SECRET`, otherwise from the per-user file `~/.driftara/confirm.key` (override the path with `DRIFTARA_TOKEN_KEY_FILE`).
  - So a dry run from one CLI call can be confirmed by a later one, and by the app.
- **Logging.** Every write or destructive execute is logged with the action id, request id, tier and duration. Argument values are not logged.

Destructive example:

```text
execute("ipc.db.delete-image", {"id": 42}, dry_run=true)
  -> data.preview.would_invoke, data.confirm_token
execute("ipc.db.delete-image", {"id": 42}, confirmed=true, confirm_token="<from dry run>")
```

## Setup

### MCP client

Use one key, `driftara`. The templates are [`.mcp.json.example`](../../.mcp.json.example) (Claude Code), [`.cursor/mcp.example.json`](../../.cursor/mcp.example.json) (Cursor), [`mcp_config.example.json`](../../mcp_config.example.json) (Antigravity) and [`.codex/config.example.toml`](../../.codex/config.example.toml) (Codex):

```json
{
  "mcpServers": {
    "driftara": { "command": "node", "args": ["mcp-server/dist/driftara.js"] }
  }
}
```

Build once: `cd mcp-server && npm install && npm run build`.

### The live server (in-app)

`ipc.*` and `live.*` actions need the gallery running with its live SSE server:
- start the gallery with `npm run dev`, or set `ENABLE_GALLERY_MCP_SSE=1`;
- the server listens on port `9373` (`GALLERY_MCP_PORT`) and writes `gallery-mcp.lock`;
- driftara finds it through that lock file and authenticates with `GALLERY_MCP_TOKEN`.

A forwarded call that gets no answer within `DRIFTARA_LIVE_TIMEOUT_MS` (default 120000) returns `live_timeout`. The action may still be running in the app.

The live server also serves the driftara tools directly at `/mcp/sse` (the optional `is-ui-live` key in `.cursor/mcp.pair.example.json`).

## CLI

The CLI runs through `scripts\driftara.cmd …` (Windows) or `node mcp-server/dist/driftara.js …`. With no command, or with `mcp`, it runs the stdio MCP server.

```text
driftara search QUERY [--source local|ipc|cdp|api|system] [--category C] [--tier T] [--limit N] [--schemas]
driftara resolve ACTION_ID
driftara exec ACTION_ID [--args JSON | --args-file PATH] [--dry-run] [--confirm] [--token T] [--request-id ID]
driftara list [--source S] [--category C] [--tier T]
driftara status                     # catalog counts, backend and live-server reachability
```

`--json` prints raw envelopes. Exit codes: 0 success, 1 action error (including `live_unavailable`), 2 usage error, or `dist/` not built.

```text
scripts\driftara.cmd status
scripts\driftara.cmd search "gallery status"
scripts\driftara.cmd exec local.gallery_status
scripts\driftara.cmd exec ipc.db.get-image-count
scripts\driftara.cmd exec ipc.db.delete-image --args "{\"id\":42}" --dry-run
```

## Deprecated surfaces

| Old entry point | Now |
|-----------------|-----|
| `is-ui-mcp` (`mcp-server/dist/compactIndex.js`) | Shim: logs a deprecation line, serves the driftara tools |
| `is-ui-router` (`routerIndex.js`), `is-ui-local` (`localIndex.js`), `is-ui-api` (`apiIndex.js`), full profile (`index.js`) | Shims: log a deprecation line, serve the driftara tools |
| `is-ui-live` (`/mcp/sse` in the app) | Serves the driftara tools |
| `dispatch`, `sse_status` tools | Deprecated aliases of `execute` (see [Tools](#tools)) |

Old `dispatch` ids such as `live.cdp_screenshot` and `local.gallery_status` still resolve.

## Related

- [driftara architecture](../architecture/03-driftara-mcp.md)
- [vexlum (backend)](https://github.com/synthet/image-scoring-pipeline/blob/main/docs/technical/VEXLUM_MCP.md)
- [MCP compact server guide](../guides/05-mcp-compact-servers.md) (the earlier `is-ui-mcp` surface)

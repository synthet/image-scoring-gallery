---
type: "Architecture"
title: "03 - driftara MCP architecture"
description: "How driftara works inside: the generated catalog, the service and tier policy, the two front doors (MCP and CLI), and how ipc.* calls reach Electron's main process through the live server."
resource: "docs/architecture/03-driftara-mcp.md"
tags: ["architecture", "gallery-docs", "mcp", "agents"]
timestamp: 2026-11-02T00:00:00Z
okf_version: 0.1
---

# 03 - driftara MCP architecture

How driftara, the gallery's single MCP server and CLI, is built. For what each tool takes and returns, see the [driftara contract](../technical/DRIFTARA_MCP.md).

## Components

```text
 agent (Claude Code, Cursor, Codex, Antigravity)     you (terminal)
            │ stdio MCP                                   │ CLI
            ▼                                             ▼
   mcp-server/dist/driftara.js  ──────  scripts\driftara.cmd
            │  createDriftaraServer (search / resolve / execute,
            │  deprecated dispatch / sse_status)
            ▼
   DriftaraService ── catalog.json + overrides.json (generated, checked in)
     │  validate → policy (tier, confirm token) → executor → redact → envelope
     ├─ local.* / system.* / api.*   run in this process (api.* = HTTP to the backend URL)
     └─ ipc.* / live.*  ── forwarded whole ──►  live server in the gallery app
                                                (SSE :9373, gallery-mcp.lock, GALLERY_MCP_TOKEN)
                                                  │ same DriftaraService, with app hooks
                                                  ├─ ipc.*  → IpcInvokeRegistry → the channel's handler
                                                  └─ live.* → Chrome DevTools (renderer)
```

| Part | File | Job |
|------|------|-----|
| Entry point | `mcp-server/src/driftara.ts` | With no command or `mcp`: a stdio MCP server. Otherwise the CLI (`search`, `resolve`, `exec`, `list`, `status`). |
| MCP surface | `mcp-server/src/createDriftaraServer.ts` | Defines the five tools and maps tool calls to the service. Also used by the deprecated `compactIndex.js`, `routerIndex.js`, `localIndex.js`, `apiIndex.js` and `index.js` shims, which log a deprecation line first. |
| Service | `mcp-server/src/driftara/service.ts` | Search ranking, `resolve`, `execute`, the envelopes and error codes, and forwarding of live calls. |
| Catalog | `mcp-server/src/driftara/catalog.ts` | Loads `catalog.json`, resolves ids, aliases and legacy names, and suggests near matches. |
| Policy | `mcp-server/src/driftara/policy.ts` | Tier checks and the HMAC confirm token. A port of vexlum's `policy.py`. |
| Validation, redaction | `validate.ts`, `redact.ts` | JSON Schema argument checks; secret-looking values masked in results. |
| CLI | `mcp-server/src/driftara/cli.ts` | Argument parsing, output, and exit codes 0/1/2. |
| Live server | `mcp-server/src/liveServer.ts` | Runs inside Electron (`electron/galleryMcpLive.ts`). Serves the driftara tools over SSE and runs forwarded calls with the app's hooks. |
| IPC registry | `electron/ipc/ipcInvokeRegistry.ts` | Wraps `ipcMain`, so every `ipcMain.handle` handler is recorded when it registers. `main.ts` hands the registrars this wrapper. |
| Catalog builder | `mcp-server/scripts/build_driftara_catalog.mjs` | Generates `catalog.json`, checks it for drift, and keeps the contract page's catalog block current. |

## The catalog

`build_driftara_catalog.mjs` builds one record per action, all with the same shape: `action_id, source, category, title, description, tags, aliases, intent_examples, input_schema, tier, native_dry_run, executor, legacy_tool_name, canonical_docs, notes`.

- **`ipc` records** come from the source. The builder uses the TypeScript compiler API to find every `ipcMain.handle(...)` in `electron/ipc/register*Handlers.ts` and `electron/main.ts`. It takes the channel name and turns the handler's parameter types into JSON Schema, with a depth and size cap. The id is `ipc.<group>.<channel>`, where the group comes from the registrar file (`registerDbHandlers.ts` gives `db`).
- **`local`, `api` and `cdp` records** carry over from the earlier action registry (`mcp-server/action_registry.json`). Their old `dispatch` ids still resolve.
- **`overrides.json`** holds what can't be derived from the code: every IPC channel's reviewed `tier`, plus aliases, intent examples and notes.
- **Drift.** `--check` fails when `catalog.json` no longer matches the sources, and `--check-doc` fails when the contract page's block is stale. A channel without a reviewed tier also fails.
  - Both checks run in CI as `npm run check:driftara-catalog --prefix mcp-server`.
  - So a new IPC channel can't ship without a tier.

## Executing an action

1. **Resolve** the id: exact id, alias, legacy name, or IPC channel name. A miss returns `unknown_action` with suggestions, and with a pointer to vexlum when the intent is backend work.
2. **Validate** the arguments against the record's `input_schema`.
3. **Forward or run.**
   - **Forwarded.** `ipc.*` and `live.*` need the app. If this process doesn't have the app's hooks (the CLI, or the stdio server), the whole call is forwarded to the live server: the arguments plus `dry_run`, `confirmed`, `confirm_token` and `request_id`. The service there repeats steps 1–4 with the hooks attached. No live server gives `live_unavailable`; no answer in time gives `live_timeout`.
   - **Local.** Everything else runs in this process.
4. **Policy**, in the process that will run the action:
   - `read` runs;
   - `write` needs `confirmed=true`;
   - `destructive` needs `DRIFTARA_ALLOW_ELEVATED=1` in that process, a confirm token from a dry run with the same arguments, and `confirmed=true`.

   A dry run returns the call that would be made (for IPC, the channel and its argument list) and, for destructive actions, the token.
5. **Run.**
   - For an IPC action, `IpcInvokeRegistry.invoke(channel, args)` calls the recorded handler with a marked stand-in event; no renderer's sender is involved.
   - The live server only accepts channels that are in the checked-in catalog, and only channels registered through the wrapper can be called at all.
6. **Return** the envelope, after redacting secret-looking values. Writes and destructive runs are logged without their arguments.

**Why policy runs in the app for IPC.** The handler, the data it changes and the app's environment are all in the Electron process. Checking there means a CLI can't loosen the policy for an action that runs somewhere else, and the elevation flag is set where the deletion actually happens.

## Relation to vexlum

driftara mirrors the backend's vexlum: the same three tools, envelope fields, tier names, token format and CLI verbs. The difference is scope. driftara covers what the gallery itself can do: its IPC handlers, its renderer and its local probes. vexlum covers backend REST, SQL and jobs. driftara has no `vexlum.*` passthrough. A backend request that driftara can't serve gets a hint to use vexlum.

## Testing

| Test | Covers |
|------|--------|
| `mcp-server/src/driftara/catalog.test.ts` | The catalog loads, ids are unique, every `ipcMain.handle` channel has exactly one record and a reviewed tier, and old registry ids still resolve |
| `policy.test.ts` | The tier matrix; the token's HMAC, TTL and argument binding; the elevation gate; the key file |
| `service.test.ts` | Search, resolve, execute, the envelopes, `live_unavailable`, redaction and the aliases |
| `cli.test.ts` | The CLI parser, flags and exit codes |
| `driftaraLive.test.ts` | Forwarding to a live server and policy in the app process |
| CI | `npm run test:unit --prefix mcp-server` and `npm run check:driftara-catalog --prefix mcp-server` |

[← Back to Architecture](README.md)

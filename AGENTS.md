# AI Agents Configuration: Electron Gallery

This document describes the AI agent integration for **Driftara Gallery** (`image-scoring-gallery`).

## Overview
This project is optimized for AI-assisted development using Cursor IDE and Antigravity. It leverages MCP (Model Context Protocol) to provide agents with deep visibility into the shared scoring database.

## SDLC / agent-sdlc

This repo vendors **[agent-sdlc](https://github.com/synthet/agent-sdlc)**-style Cursor rules (`.cursor/rules/`), slash commands (`.cursor/commands/`), and project skills (`.cursor/skills/`). **This `AGENTS.md` file** remains the source of truth for canonical commands, repository layout, and boundaries.

### Agent skills inventory (AST09 / AST10)

Project skills live only under [`.cursor/skills/`](.cursor/skills/) (no `.claude/skills/` mirror in this repo). **Inventory:** [.agent/SKILL_INVENTORY.md](.agent/SKILL_INVENTORY.md). **PR review prompts** for `SKILL.md` changes: sibling [image-scoring-backend/.agent/SKILL_CHANGE_AST10_REVIEW.md](https://github.com/synthet/image-scoring-backend/blob/main/.agent/SKILL_CHANGE_AST10_REVIEW.md) (use the same checklist locally if you have a sibling clone: `../image-scoring-backend/.agent/SKILL_CHANGE_AST10_REVIEW.md`).

**Cursor slash commands** (type `/` in chat): **`/spec`**, **`/plan`**, **`/implement`**, **`/test-and-fix`**, **`/pr-ready`**, **`/release-notes`**, **`/check-subagents`**, **`/run-codex-review`**, **`/run-gemini-review`**, **`/run-subagent-review`**. **Claude Code** mirrors these under `.claude/commands/`.

**External CLI reviews:** sibling [`subagent-orchestrator`](../subagent-orchestrator) via user-level **`subagent-orchestrator`** — see [docs/technical/EXTERNAL_CLI_REVIEWS.md](docs/technical/EXTERNAL_CLI_REVIEWS.md).

## MCP Configuration

Domain-split MCP. **Naming:** `is-` = image scoring; **`is-ui-*`** = this repo (gallery); **`is-be-*`** = sibling backend.

**Canonical contract (backend):** [MCP_SEARCH_DISPATCH.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/MCP_SEARCH_DISPATCH.md)

### Setup (operator-local)

1. Copy [`.cursor/mcp.example.json`](.cursor/mcp.example.json) → **`.cursor/mcp.json`** (gitignored; never commit your local file).
2. `cd mcp-server && npm install && npm run build`
3. Reload MCP in Cursor.

Do **not** add `is-be-*` keys in this repo — use sibling **image-scoring-backend** workspace for backend triage.

### Gallery-first workflow

1. **`is-ui-router`** → **`ui_find(query)`** when tool choice is unclear
2. **`is-ui-local`** → `gallery_status`, logs, config
3. **`is-ui-api`** → `api_*` when backend WebUI is up
4. **`is-ui-live`** → `cdp_*`, IPC when Electron is running

**Backend pipeline triage** (sibling workspace): **`is-be-mcp`** → `search` → `dispatch`.

| Cursor server key | Transport | Requires running app? |
|-------------------|-----------|------------------------|
| **`is-ui-router`** | stdio | No — `ui_find`, `ui_domains`, `ui_card` |
| **`is-ui-local`** | stdio | No — `gallery_status`, logs, config |
| **`is-ui-api`** | stdio | Backend WebUI for `api_*` |
| **`is-ui-live`** | SSE (Electron) | Yes — `npm run dev` or `ENABLE_GALLERY_MCP_SSE=1` |
| **`is-ui-full`** | stdio | Legacy monolithic local+api (disabled in example) |

Backend (sibling **image-scoring-backend**): **`is-be-mcp`** (preferred), **`is-be-diag`**, **`is-be-jobs`**, **`is-be-data`**, **`is-be-webui`** — see backend [AGENTS.md](https://github.com/synthet/image-scoring-backend/blob/main/AGENTS.md).

- Live SSE: default `http://127.0.0.1:9373/mcp/sse`; see **`gallery-mcp.lock`** after Electron starts.
- Optional auth: **`GALLERY_MCP_TOKEN`**.

User `~/.cursor/mcp.json`: cross-repo tools only — **do not** duplicate `is-ui-*` / `is-be-*` there.

**Legacy keys:** remove obsolete gallery/backend MCP server keys from user `~/.cursor/mcp.json` (pre-2026-06 naming).

### Requirements

- **`is-ui-router`** / **`is-ui-local`** / **`is-ui-api`**: Node; `mcp-server/dist/*Index.js` built.
- **`is-ui-live`**: Electron dev (`ELECTRON_IS_DEV=1`) or `ENABLE_GALLERY_MCP_SSE=1`.
- **Database:** PostgreSQL (local `pg`) and/or backend API SQL mode; configure `database` in `config.json` (see `docs/architecture/02-database-design.md`).

## Tools for Agents

- **`is-ui-router`**: **`ui_find`** — discover tools across gallery profiles.
- **`is-ui-local`**: Start with **`gallery_status`**; then logs and config.
- **`is-ui-api`**: **`api_health`**, **`api_*`** when backend WebUI is up.
- **`is-ui-live`**: **`cdp_*`**, **`gallery_window_status`**, **`gallery_ipc_ping`** when Electron is running.
- **`is-be-mcp`** (backend workspace): **`search`**, **`dispatch`** for pipeline/DB deep triage.

### mcp-kanban (optional, user MCP)

**mcp-kanban** is configured in **user-level** MCP settings (Cursor global `mcp.json`, Claude `~/.claude.json`, Antigravity `mcp_config.json`, Codex `config.toml`) as server **`mcp-kanban`**. It provides **`kanban_*`** tools for tickets, board snapshots, and session handoffs.

- **Rules / workflow:** `.cursor/rules/mcp-kanban.mdc`, `.cursor/skills/mcp-kanban-workflow/SKILL.md`
- **Project folder:** use your local clone path to **image-scoring-gallery** for gallery work and to **image-scoring-backend** for backend work.

## Git Configuration — Do Not Modify

**Never modify `.git/config`** — do not set `extensions.worktreeConfig`, change `core.repositoryformatversion`, or add any git extensions. Third-party tools (Gemini Code Assist / Antigravity) use embedded git libraries that fail on non-standard extensions, breaking workspace resolution. If a worktree is needed, use a temporary one and clean it up immediately — do not leave worktree config persisted in the repo.

## Documentation References
- **[CANONICAL_SOURCES.md](docs/CANONICAL_SOURCES.md)** — Local vs backend authority (API, schema, coordination)
- **[WIKI_SCHEMA.md](docs/WIKI_SCHEMA.md)** — `docs/` layout, naming, and `docs/log.md` maintenance
- **[features/implemented/INDEX.md](docs/features/implemented/INDEX.md)** — Shipped feature pages hub
- **[Backlog workflow](docs/project/00-backlog-workflow.md)** — Root `TODO.md`, mirror sync order (**image-scoring-backend** twin: [`00-backlog-workflow.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/00-backlog-workflow.md); [`BACKLOG_GOVERNANCE.md`](docs/project/BACKLOG_GOVERNANCE.md) here is an alias)
- **[Pipeline terminology](docs/technical/PIPELINE_TERMINOLOGY.md)** — Stage labels vs API (`pipelineLabels.ts`); canonical table: **[backend PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md)**
- **[Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md)** — Cross-project integration (canonical; local stub: [`docs/technical/AGENT_COORDINATION.md`](docs/technical/AGENT_COORDINATION.md))
- **[.cursorrules](.cursorrules)**: Core project rules and architecture patterns.
- **[Project Guide](.agent/PROJECT_GUIDE.md)**: Navigation and maintenance guide.
- **[AI Edit Spec](.agent/ai_edit_spec.md)**: Coding guidelines for agents.
- **Agent infra:** [.agent/AGENT_INFRA_INVENTORY.md](.agent/AGENT_INFRA_INVENTORY.md), [.agent/COMMANDS.md](.agent/COMMANDS.md), [.agent/SAFETY.md](.agent/SAFETY.md), [.agent/subagents/README.md](.agent/subagents/README.md), [.agent/workflows/](.agent/workflows/).

## Cursor Cloud specific instructions

### Services overview

| Service | How to run | Notes |
|---------|-----------|-------|
| Vite dev server | `npm run dev:web` | Serves React UI on `http://localhost:5173` |
| Electron app | `ELECTRON_IS_DEV=1 npx electron .` | Requires Vite running first; compile TS with `npx tsc -p electron/tsconfig.json` before launching |
| Lint | `npm run lint` | Pre-existing errors in codebase (30 errors, 7 warnings); these are not regressions |
| Tests | `npm run test:run` | Vitest, 195 tests across 31 files |
| Type-check | `npx tsc --noEmit` | Checks renderer TS; electron TS uses `npx tsc -p electron/tsconfig.json` |

### Running the Electron app on Linux (Cloud VM)

- Current dev composition is already Linux-friendly via npm scripts:
  1. `npm run server` — starts the backend/API process expected by the gallery
  2. `vite` — starts the Vite dev server on `http://localhost:5173`
  3. `npm run dev:electron` — waits for Vite, compiles Electron TS, and launches Electron in dev mode
- `npm run dev` runs those three commands concurrently (`server`, `vite`, `dev:electron`) and is the easiest default for local Linux/Cloud VM use.
- If you need renderer-only work, use `npm run dev:web` (server + Vite) without launching Electron.
- The app may still show a connection error at startup if PostgreSQL or the backend API URL is unreachable in the VM. The UI can still load for layout and static testing.
- dbus errors in Electron logs (e.g. `Failed to connect to the bus`) are harmless in a headless/container Linux environment.
- _Verified against `package.json` scripts on 2026-04-19._

### Lockfile

- Uses `package-lock.json` (npm). The `mcp-server/` subdirectory has its own `package-lock.json` and requires a separate `npm install` if you need to work on MCP tooling.

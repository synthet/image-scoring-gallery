# AI Agents Configuration: Electron Gallery

This document describes the AI agent integration for the Electron Image Scoring Gallery.

## Overview
This project is optimized for AI-assisted development using Cursor IDE and Antigravity. It leverages MCP (Model Context Protocol) to provide agents with deep visibility into the shared scoring database.

## SDLC / agent-sdlc

This repo vendors **[agent-sdlc](https://github.com/synthet/agent-sdlc)**-style Cursor rules (`.cursor/rules/`), slash commands (`.cursor/commands/`), and project skills (`.cursor/skills/`). **This `AGENTS.md` file** remains the source of truth for canonical commands, repository layout, and boundaries.

**Cursor slash commands** (type `/` in chat): **`/spec`**, **`/plan`**, **`/implement`**, **`/test-and-fix`**, **`/pr-ready`**, **`/release-notes`**. **Claude Code** mirrors these under `.claude/commands/`.

## MCP Configuration
The `.cursor/mcp.json` file uses the **`imgscore-el-*`** prefix so server names stay unique when Cursor merges multiple project configs.

**Primary (enabled): `imgscore-el-gallery`** — single stdio app from [`mcp-server/`](mcp-server/) (`node …/mcp-server/dist/index.js`). Always: logs, `config.json`, `get_system_stats`, **`gallery_status`** (probes FastAPI + Electron CDP). When the Python WebUI is up: **`api_*`** tools against the resolved backend URL. When Electron runs in dev with remote debugging: **`cdp_*`** tools (default CDP port 9222; set `ELECTRON_CDP_URL` or `ELECTRON_REMOTE_DEBUGGING_PORT` to match).

**Opt-in: `imgscore-el-stdio`** — Python **`modules.mcp_server`** (full DB diagnostics, ~43 tools). **Disabled by default** in this repo; enable in MCP settings or open the **image-scoring-backend** workspace, which uses **`imgscore-py-stdio`**. **`imgscore-el-sse`** — WebUI SSE (e.g. `execute_code` when `ENABLE_MCP_EXECUTE_CODE=1`).

### Requirements
- **`imgscore-el-gallery`**: Node; run `npm install` and `npm run build` under `mcp-server/` once.
- **Full DB MCP**: Python env with `mcp` (and DB drivers) when **`imgscore-el-stdio`** / backend workspace is enabled.
- **Database:** PostgreSQL (local `pg`) and/or backend API SQL mode; configure `database` in `config.json` (see `docs/architecture/02-database-design.md`).

## Tools for Agents
- **Gallery MCP (`imgscore-el-gallery`)**: Local diagnostics, optional FastAPI job/health probes, optional CDP for renderer inspection. Start with **`gallery_status`** to see what is reachable.
- **Python MCP (optional)**: Query images, `execute_sql`, health, jobs — see backend **`AGENTS.md`** / **`imgscore-py-stdio`**.

### mcp-kanban (optional, user MCP)

**mcp-kanban** is configured in **user-level** MCP settings (Cursor global `mcp.json`, Claude `~/.claude.json`, Antigravity `mcp_config.json`, Codex `config.toml`) as server **`mcp-kanban`**. It provides **`kanban_*`** tools for tickets, board snapshots, and session handoffs.

- **Rules / workflow:** `.cursor/rules/mcp-kanban.mdc`, `.cursor/skills/mcp-kanban-workflow/SKILL.md`
- **Project folder:** use your local clone path to **image-scoring-gallery** for gallery work and to **image-scoring-backend** for backend work.

## Git Configuration — Do Not Modify

**Never modify `.git/config`** — do not set `extensions.worktreeConfig`, change `core.repositoryformatversion`, or add any git extensions. Third-party tools (Gemini Code Assist / Antigravity) use embedded git libraries that fail on non-standard extensions, breaking workspace resolution. If a worktree is needed, use a temporary one and clean it up immediately — do not leave worktree config persisted in the repo.

## Documentation References
- **[Backlog workflow](docs/project/00-backlog-workflow.md)** — Root `TODO.md`, mirror sync order (**image-scoring-backend** twin: [`00-backlog-workflow.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/00-backlog-workflow.md); [`BACKLOG_GOVERNANCE.md`](docs/project/BACKLOG_GOVERNANCE.md) here is an alias)
- **[Pipeline terminology](docs/technical/PIPELINE_TERMINOLOGY.md)** — Stage labels vs API (`pipelineLabels.ts`); canonical table: **[backend PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md)**
- **[Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md)** — Cross-project integration (canonical; local stub: [`docs/technical/AGENT_COORDINATION.md`](docs/technical/AGENT_COORDINATION.md))
- **[.cursorrules](.cursorrules)**: Core project rules and architecture patterns.
- **[Project Guide](.agent/PROJECT_GUIDE.md)**: Navigation and maintenance guide.
- **[AI Edit Spec](.agent/ai_edit_spec.md)**: Coding guidelines for agents.

## Cursor Cloud specific instructions

### Services overview

| Service | How to run | Notes |
|---------|-----------|-------|
| Vite dev server | `npm run dev:web` | Serves React UI on `http://localhost:5173` |
| Electron app | `ELECTRON_IS_DEV=1 npx electron .` | Requires Vite running first; compile TS with `npx tsc -p electron/tsconfig.json` before launching |
| Lint | `npm run lint` | Pre-existing errors in codebase (30 errors, 7 warnings); these are not regressions |
| Tests | `npm run test:run` | Vitest, 84 tests across 12 files |
| Type-check | `npx tsc --noEmit` | Checks renderer TS; electron TS uses `npx tsc -p electron/tsconfig.json` |

### Running the Electron app on Linux (Cloud VM)

- The `npm run dev` script includes `db:start` which calls a **PowerShell script** (`scripts/start_db.ps1`) — this is Windows-only and will fail on Linux. Instead, run the components separately:
  1. `npm run dev:web` — starts the Vite dev server
  2. `npx tsc -p electron/tsconfig.json` — compiles Electron main process TypeScript
  3. `ELECTRON_IS_DEV=1 npx electron .` — launches Electron (set env var directly; `cross-env` may not be on PATH as a global binary)
- The app may show a connection error at startup if PostgreSQL or the backend API URL is unreachable in the VM. The UI can still load for layout and static testing.
- `cross-env` is installed as a devDependency but not globally, so use `ELECTRON_IS_DEV=1` env prefix directly instead of `cross-env ELECTRON_IS_DEV=1`.
- dbus errors in Electron logs (e.g. `Failed to connect to the bus`) are harmless in a headless/container Linux environment.

### Lockfile

- Uses `package-lock.json` (npm). The `mcp-server/` subdirectory has its own `package-lock.json` and requires a separate `npm install` if you need to work on MCP tooling.

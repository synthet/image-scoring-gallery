# AI Agents Configuration: Electron Gallery

This document describes the AI agent integration for the Electron Image Scoring Gallery.

## Overview
This project is optimized for AI-assisted development using Cursor IDE and Antigravity. It leverages MCP (Model Context Protocol) to provide agents with deep visibility into the shared scoring database.

## MCP Configuration
The `.cursor/mcp.json` file uses the **`imgscore-el-*`** prefix so server names stay unique when Cursor merges multiple project configs. Image Scoring stdio is **`imgscore-el-stdio`** (sibling **image-scoring** repo). SSE for the Python WebUI is **`imgscore-el-sse`**. The Python repo defines **`imgscore-py-stdio`** / **`imgscore-py-sse`** for the same processes when that workspace is open.

### Requirements
- Python environment with `mcp` and `firebird-driver` (typically inherited from the core `image-scoring` project).
- Access to the `SCORING_HISTORY.FDB` file.

## Tools for Agents
Agents have access to specialized tools via **`imgscore-el-stdio`** (stdio) and **`imgscore-el-sse`** (when the WebUI runs). Other entries: **`imgscore-el-firebird`**, **`imgscore-el-playwright`**, **`imgscore-el-chrome-devtools`**, **`imgscore-el-debug`**.
- **Database Analysis**: Query images, check health, run SQL.
- **System Monitoring**: Check GPU and model status.
- **Error Diagnosis**: Analyze failed jobs and missing data.

## Documentation References
- **[Agent Coordination](docs/technical/AGENT_COORDINATION.md)** - Cross-project integration and coordination guide
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
- The app will show a "Connection Error" at startup because Firebird SQL (port 3050) is not available in the cloud VM. This is expected — the UI still loads and is fully interactive.
- `cross-env` is installed as a devDependency but not globally, so use `ELECTRON_IS_DEV=1` env prefix directly instead of `cross-env ELECTRON_IS_DEV=1`.
- dbus errors in Electron logs (e.g. `Failed to connect to the bus`) are harmless in a headless/container Linux environment.

### Lockfile

- Uses `package-lock.json` (npm). The `mcp-server/` subdirectory has its own `package-lock.json` and requires a separate `npm install` if you need to work on MCP tooling.

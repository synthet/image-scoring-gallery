# Electron Image Scoring (electron-gallery)

High-performance Electron desktop gallery app with image scoring, browsing, and management.

## Related Projects

| Project | Path | Role |
|---------|------|------|
| **Python Backend** | `D:\Projects\image-scoring` | AI scoring engine, FastAPI server, Firebird DB schema owner |
| **Electron Frontend** (this) | `D:\Projects\image-scoring-gallery` | Desktop UI, IPC query layer, React/Vite |

**Project layout:** For automatic API port discovery, this project expects `image-scoring` and `image-scoring-gallery` to be sibling directories (e.g. `D:\Projects\image-scoring` and `D:\Projects\image-scoring-gallery`). The backend writes `webui.lock` with its port when running. To override, set `config.api.url` or `config.api.port` in `config.json`; config takes precedence over lock file discovery.

The backend owns all DDL/schema migrations (`modules/db.py`). This project queries the shared Firebird database but does NOT create or alter tables (except `STACK_CACHE` probe).

## MCP mcp-kanban (optional, user-level)

**mcp-kanban** provides SQLite-backed **tickets / kanban** for multi-session work. Configure it in **user** MCP settings (Cursor, Claude Code, Antigravity, Codex) as server **`mcp-kanban`**—see `.cursor/rules/mcp-kanban.mdc` and `.cursor/skills/mcp-kanban-workflow/SKILL.md`.

- Register this repo with `kanban_register_project` using **`D:\Projects\image-scoring-gallery`** (or your clone path) as `projectFolder`.
- Use **`D:\Projects\image-scoring-backend`** as `projectFolder` for backend-only tasks.

## Key Files

- `electron/db.ts` — Firebird query layer (single-connection promise queue)
- `electron/main.ts` — Electron main process, IPC handlers
- `electron/apiService.ts` — HTTP client to Python FastAPI backend
- `src/` — React frontend (Vite + TypeScript)
- `mcp-server/` — Consolidated stdio MCP (`imgscore-el-gallery`): local tools, optional FastAPI + Electron CDP

## Backend Integration Points

- **Shared DB:** `SCORING_HISTORY.FDB` (Firebird), schema managed by `D:\Projects\image-scoring\modules\db.py`
- **REST API:** Electron calls Python backend via `http://localhost:7860` for scoring/tagging jobs
- **Config:** `D:\Projects\image-scoring\config.json` controls backend behavior

## Commands

- `npm run dev` — Start dev mode (Firebird + Vite + Electron)
- `npm run build` — Production build + package
- `npx tsc --noEmit` — Type-check
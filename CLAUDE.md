# Electron Image Scoring (electron-gallery)

High-performance Electron desktop gallery app with image scoring, browsing, and management.

## Related Projects

| Project | Repository | Role |
|---------|------------|------|
| **image-scoring-backend** | [github.com/synthet/image-scoring-backend](https://github.com/synthet/image-scoring-backend) | AI scoring engine, FastAPI, PostgreSQL schema authority |
| **image-scoring-gallery** (this) | [github.com/synthet/image-scoring-gallery](https://github.com/synthet/image-scoring-gallery) | Desktop UI, IPC query layer, React/Vite |

**Project layout:** For automatic API port discovery, keep **image-scoring-backend** and **image-scoring-gallery** as sibling directories. The backend writes `webui.lock` with its port when running. To override, set `config.api.url` or `config.api.port` in `config.json`; config takes precedence over lock file discovery.

The backend owns DDL/schema migrations. This app connects via PostgreSQL (`pg`) or HTTP SQL to the backend (`database.engine`: `api`) depending on configuration; see `docs/architecture/02-database-design.md`.

## MCP mcp-kanban (optional, user-level)

**mcp-kanban** provides SQLite-backed **tickets / kanban** for multi-session work. Configure it in **user** MCP settings (Cursor, Claude Code, Antigravity, Codex) as server **`mcp-kanban`**—see `.cursor/rules/mcp-kanban.mdc` and `.cursor/skills/mcp-kanban-workflow/SKILL.md`.

- Register this repo with `kanban_register_project` using **your local clone path** to this repo as `projectFolder`.
- Use **your local clone path** to **image-scoring-backend** as `projectFolder` for backend-only tasks.

## Key Files

- `electron/db.ts` — Query layer over `electron/db/provider.ts` (PostgreSQL and/or `api` HTTP SQL to the backend)
- `electron/main.ts` — Electron main process, IPC handlers
- `electron/apiService.ts` — HTTP client to Python FastAPI backend
- `src/` — React frontend (Vite + TypeScript)
- `mcp-server/` — Consolidated stdio MCP (`imgscore-el-gallery`): local tools, optional FastAPI + Electron CDP

## Backend Integration Points

- **Database:** PostgreSQL (local) or SQL via backend API; schema owned by **image-scoring-backend** (`modules/db_postgres.py`, Alembic).
- **REST API:** Electron calls the Python backend (default `http://localhost:7860`) for scoring/tagging/clustering jobs.
- **Config:** Backend behavior is controlled by **`sibling image-scoring-backend/config.json`** (or your clone path).

## Commands

- `npm run dev` — Start dev mode (local server + Vite + Electron; ensure backend/DB are reachable per `config.json`)
- `npm run build` — Production build + package
- `npx tsc --noEmit` — Type-check

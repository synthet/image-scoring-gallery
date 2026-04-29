# Driftara Gallery (`image-scoring-gallery`)

High-performance Electron desktop gallery for browsing and managing libraries scored by **Vexlum Scoring** (`image-scoring-backend`).

## Related Projects

| Project | Repository | Role |
|---------|------------|------|
| **image-scoring-backend** | [github.com/synthet/image-scoring-backend](https://github.com/synthet/image-scoring-backend) | AI scoring engine, FastAPI, PostgreSQL schema authority |
| **image-scoring-gallery** (this) | [github.com/synthet/image-scoring-gallery](https://github.com/synthet/image-scoring-gallery) | Desktop UI, IPC query layer, React/Vite |

**Project layout:** For automatic API port discovery, keep **image-scoring-backend** and **image-scoring-gallery** as sibling directories. The backend writes `webui.lock` with its port when running. To override, set `config.api.url` or `config.api.port` in `config.json`; config takes precedence over lock file discovery.

The backend owns DDL/schema migrations. This app connects via PostgreSQL (`pg`) or HTTP SQL to the backend (`database.engine`: `api`) depending on configuration; see `docs/architecture/02-database-design.md`.

## Backlog & queue (read this before picking work)

The canonical queue is the **GitHub Project board**, not `TODO.md`:

**→ https://github.com/users/synthet/projects/1**

It spans both repos. The `TODO.md` files are pointers only.

**Mandatory contract for every agent (human or AI). Do all five steps:**

1. **Pick from `Stage = Ready`** on the board, sorted by `priority:p0..p3`. If `Ready` is empty, ask the maintainer — do not invent work.
2. **Claim** the issue: `/task-claim <N>` (preferred) or the manual `gh` flow in [`docs/project/00-backlog-workflow.md`](docs/project/00-backlog-workflow.md). Claiming assigns you and moves the card to `Stage = Claimed`.
3. **Flip to `Stage = In Progress`** on your first commit.
4. **If blocked**, move the card to `Stage = Blocked` *and* comment on the issue with the blocker + what would unblock it. Do not silently abandon a claimed card.
5. **Reference the issue in the PR** with `Closes #<N>` (the PR template requires it). Move the card to `Stage = Review` while the PR is open; merging closes the issue and flips `Status = Done`.

**Project ID quick-reference** (for scripts): project node `PVT_kwHOAFXgIs4BWC3c`, Stage field `PVTSSF_lAHOAFXgIs4BWC3czhRaNZ0`. Full Stage option IDs and command examples in [`docs/project/00-backlog-workflow.md`](docs/project/00-backlog-workflow.md) §5.

**Do not** add tasks to `TODO.md`, do not work without an issue, and do not skip the Stage transitions — agents that don't update Stage make the queue lie about what's actually being worked on.

## MCP mcp-kanban (optional, user-level)

**mcp-kanban** provides SQLite-backed **tickets / kanban** for multi-session work. Configure it in **user** MCP settings (Cursor, Claude Code, Antigravity, Codex) as server **`mcp-kanban`**—see `.cursor/rules/mcp-kanban.mdc` and `.cursor/skills/mcp-kanban-workflow/SKILL.md`.

- Register this repo with `kanban_register_project` using **your local clone path** to this repo as `projectFolder`.
- Use **your local clone path** to **image-scoring-backend** as `projectFolder` for backend-only tasks.

## Documentation

Start with **[`docs/CANONICAL_SOURCES.md`](docs/CANONICAL_SOURCES.md)** (what is canonical in this repo vs **image-scoring-backend**) and **[`docs/WIKI_SCHEMA.md`](docs/WIKI_SCHEMA.md)** when adding or moving wiki pages. Shipped feature hub: **[`docs/features/implemented/INDEX.md`](docs/features/implemented/INDEX.md)**.

## Key Files

- `src/constants/pipelineLabels.ts` — User-facing pipeline stage names aligned with backend `frontend/src/types/api.ts` (`STAGE_DISPLAY`); see `docs/technical/PIPELINE_TERMINOLOGY.md`
- `src/utils/exportImageBake.ts` — **File → Export** raster bake and EXIF orientation handling; pitfalls and main-process follow-up in [`docs/features/implemented/05-jpeg-export-exif-orientation.md`](docs/features/implemented/05-jpeg-export-exif-orientation.md)
- `electron/db.ts` — Query layer over `electron/db/provider.ts` (PostgreSQL and/or `api` HTTP SQL to the backend)
- `electron/main.ts` — Electron main process, IPC handlers
- `electron/apiService.ts` — HTTP client to Python FastAPI backend
- `src/` — React frontend (Vite + TypeScript)
- `mcp-server/` — Consolidated stdio MCP (`imgscore-el-gallery`): local tools, optional FastAPI + Electron CDP

## Backend Integration Points

- **Database:** PostgreSQL (local) or SQL via backend API; schema owned by **image-scoring-backend** (`modules/db_postgres.py`, Alembic).
- **REST API:** Electron calls the Python backend (default `http://localhost:7860`) for scoring/tagging/clustering jobs.
- **Config:** Backend behavior is controlled by **`sibling image-scoring-backend/config.json`** (or your clone path).

## Development Guidelines

- **Never modify `.git/config`** — do not set `extensions.worktreeConfig`, change `core.repositoryformatversion`, or add any git extensions. Third-party tools (Gemini Code Assist / Antigravity) use embedded git libraries that choke on non-standard extensions, breaking workspace resolution. If a worktree is needed, use a temporary one and clean it up immediately — do not leave worktree config persisted in the repo.

## Commands

- `npm run dev` — Start dev mode (local server + Vite + Electron; ensure backend/DB are reachable per `config.json`)
- `npm run build` — Production build + package
- `npx tsc --noEmit` — Type-check

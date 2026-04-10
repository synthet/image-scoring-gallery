---
name: gallery-electron-ts
description: >-
  Works in image-scoring-gallery on electron/db.ts contract, IPC, apiService,
  React/Vite, and alignment with sibling image-scoring-backend schema. Use for
  desktop app bugs, database.engine modes, API URL/port from webui.lock, or
  TypeScript changes under electron/ or src/. Triggers include Electron gallery,
  db.ts, IPC, apiService, config.api, PostgreSQL vs api engine, and Vite renderer.
---

# Gallery Electron + TypeScript (gallery-electron-ts)

## Operating mode

- **Default:** Implement and edit code as needed (`readonly` false).
- **Audit-only:** If the user asks for a compatibility audit, schema review, or
  “audit only / no edits,” treat the task as **read-only**: analyze files and
  report gaps; do **not** modify the repository unless they explicitly switch
  to implementation.

## When to apply

- Bugs or features in the **Electron** app (main process, preload, IPC).
- **`database.engine`** behavior (`pg` vs `api` / HTTP SQL) and query contracts.
- **Backend URL/port:** `webui.lock` discovery vs `config.api.url` /
  `config.api.port` (config wins).
- **TypeScript** in `electron/` or `src/` (renderer).

## Schema and API authority (before renaming columns or response shapes)

The **image-scoring-backend** repo owns the database schema and REST contract.

1. Cross-check **`modules/db_postgres.py`** (DDL and table/column names) and
   Alembic migrations under **`migrations/versions/`** when available.
2. Use backend docs as needed: **`docs/technical/DB_SCHEMA.md`**,
   **`docs/technical/API_CONTRACT.md`**, and gallery
   **`docs/architecture/02-database-design.md`** for how Electron connects.
3. Do **not** rename columns, JSON shapes, or IPC payloads to “match a guess.”
   If a change requires backend DDL or API changes, **call that out explicitly**
   and treat it as a **coordinated change** (gallery PR + backend PR), unless the
   user scope is gallery-only with a documented workaround.

## Key files (gallery)

| Area | Location |
|------|----------|
| SQL / DB contract | `electron/db.ts`, `electron/db/provider.ts` |
| IPC | `electron/main.ts` (and related preload/handlers) |
| HTTP to FastAPI | `electron/apiService.ts` |
| UI | `src/` (Vite + React) |

Keep **sibling clone layout** in mind: backend and gallery as sibling folders so
`webui.lock` path resolution matches real dev setups (see root **`CLAUDE.md`**).

## Commands (canonical: **`AGENTS.md`**)

- Renderer type-check: `npx tsc --noEmit`
- Electron main process: `npx tsc -p electron/tsconfig.json`
- Lint: `npm run lint` (known pre-existing issues; avoid introducing new ones)
- Tests: `npm run test:run`

## Dev environment: Linux vs Windows

- **`npm run dev`** may run **`db:start`** via PowerShell — **Windows-oriented**;
  on **Linux**, follow **`AGENTS.md` “Cursor Cloud” / Linux** flow: run
  `npm run dev:web`, compile Electron TS, then `ELECTRON_IS_DEV=1 npx electron .`
  as documented there.
- Do not assume `cross-env` is on PATH globally; use the env-prefix style from
  **`AGENTS.md`** on Linux.

## Implementation discipline

- Prefer **small, focused diffs**; avoid unrelated refactors.
- When a change **requires** backend schema or API updates, state that clearly in
  the summary (and what must change in **image-scoring-backend**).

## Optional MCP

When debugging integration with a running backend, **`imgscore-el-gallery`**
(`gallery_status`, API probes) is described in **`AGENTS.md`**.

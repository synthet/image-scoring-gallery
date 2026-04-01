# Electron Image Scoring - LLM Context Guide

## Project Overview

Electron-based image gallery viewer for the Image Scoring ecosystem. Connects to a shared PostgreSQL database (with pgvector) populated by the core scoring engine (`image-scoring-backend`).

Primary goals:

- Browse and view scored images from the database
- Navigate folder structure and filter by score, rating, keywords
- Display RAW (NEF) previews with multi-tier extraction fallback

## Current Architecture (high level)

- **Stack**: Electron + React + TypeScript + Vite
- **Database**: PostgreSQL + pgvector (via `pg` driver); legacy Firebird has been decommissioned
- **IPC**: Main process handles DB, file system; renderer handles UI; `contextBridge` in preload

## Entry points

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Build the production application |
| `npm run lint` | Run ESLint checks |

## Key code locations

| Area | Path |
|------|------|
| Main process | `electron/main.ts` |
| Database layer | `electron/db.ts` |
| DB provider abstraction | `electron/db/provider.ts` |
| Preload / IPC bridge | `electron/preload.ts` |
| NEF extraction | `electron/nefExtractor.ts`, `src/utils/nefViewer.ts` |
| UI components | `src/components/` |
| Hooks | `src/hooks/` |

## Technical notes

- **media:// protocol**: Custom protocol for serving image files; requires path validation.
- **NEF previews**: Multi-tier fallback (ExifTool → SubIFD Parser → Marker Scan).
- **Database**: All DB access must occur in Main Process only. The `electron/db/provider.ts` abstraction supports `postgres` and `api` connectors.
- **Import progress**: When using the API (Python backend), import runs in a single request; progress is reported once at completion. Direct DB fallback reports per-file progress.

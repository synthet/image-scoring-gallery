# System Overview

Driftara Gallery is an **Electron + React + TypeScript + Vite** desktop app for browsing libraries produced by **Vexlum Scoring**.

## Runtime Shape

| Layer | Responsibilities |
|---|---|
| Electron main process | Owns database access, filesystem access, native dialogs, `media://` protocol handling, API calls, RAW/NEF extraction, export writes, sync/import/backup handlers, and IPC registration. |
| Preload / contextBridge | Exposes a constrained `window.electron` bridge from [electron/preload.ts](../../electron/preload.ts). Renderer code should use this bridge rather than Node/Electron APIs directly. |
| Renderer | React UI, navigation, filters, gallery grid, viewer, modals, stores, and user interactions under `src/`. |
| Backend | FastAPI/Gradio service from image-scoring-backend, defaulting to port `7860`, owns API/schema/pipeline terminology. |

Do not put direct database or filesystem access in the renderer process.

## Main Process

Primary file: [electron/main.ts](../../electron/main.ts).

Main-process responsibilities include:

- Creating BrowserWindow and menus.
- Registering `media://` for local image serving.
- Handling `db:*`, `api:*`, `nef:*`, `fs:*`, `sync:*`, `backup:*`, import, settings, and export IPC.
- Using [electron/db.ts](../../electron/db.ts) for query behavior.
- Using [electron/apiService.ts](../../electron/apiService.ts) for backend HTTP calls.
- Using [electron/nefExtractor.ts](../../electron/nefExtractor.ts) and ExifTool-backed helpers for RAW/NEF preview and metadata flows.

## Renderer

Renderer code lives under [src/](../../src/). It owns UI state, React components, hooks, stores, and display logic.

Renderer stage labels come from [src/constants/pipelineLabels.ts](../../src/constants/pipelineLabels.ts) and must stay aligned with backend [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md).

## API Mode Vs PostgreSQL Mode

The DB provider abstraction in [electron/db/provider.ts](../../electron/db/provider.ts) supports:

- `postgres` / `postgresql`: direct PostgreSQL access through the `pg` driver in the Electron main process.
- `api`: query through backend HTTP endpoints such as `/api/db/query` and health checks.

Config normalization may map legacy Firebird config values to the current supported modes, but Firebird is historical for current docs unless code proves otherwise. See [02-database-design.md](02-database-design.md).

## media:// Protocol

The custom `media://` protocol serves local files for thumbnails and images. URL/path parsing helpers live in [electron/mediaUrlParse.ts](../../electron/mediaUrlParse.ts) and renderer URL helpers in [src/utils/mediaUrl.ts](../../src/utils/mediaUrl.ts).

Path handling is security-sensitive. Preserve validation and regression tests when changing it.

Thumbnail **pixel dimensions** are produced by the backend (`modules/thumbnails.py`, default max edge 512). Ongoing backend research on ideal ML input size may change thumb generation later; gallery reads paths only. See [reports/07-pipeline-input-size-study-2026-05.md](../reports/07-pipeline-input-size-study-2026-05.md).

## RAW / NEF Preview Flow

RAW/NEF display can use multiple paths:

- Local IPC preview extraction through `nef:extract-preview`.
- Main-process metadata reads through `nef:read-exif` and `fs:read-image-metadata`.
- Backend preview endpoints used by [electron/apiService.ts](../../electron/apiService.ts), including `GET /api/raw-preview`.
- Renderer fallback logic in [src/utils/nefViewer.ts](../../src/utils/nefViewer.ts) and image components.

Do not change NEF preview behavior or export orientation handling without tests. Relevant feature docs:

- [../features/implemented/01-nef-raw-fallback.md](../features/implemented/01-nef-raw-fallback.md)
- [../features/implemented/05-jpeg-export-exif-orientation.md](../features/implemented/05-jpeg-export-exif-orientation.md)
- Backend [RAW/NEF docs](https://github.com/synthet/image-scoring-backend/blob/main/docs/IMAGE_PIPELINE.md)

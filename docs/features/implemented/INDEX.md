# Features Implemented

Catalog of shipped desktop behavior. Backend API/schema/pipeline contracts remain owned by **image-scoring-backend**; link to backend authority instead of restating fields or phase definitions.

| Area | Shipped behavior | Primary docs | Primary code / authority |
|---|---|---|---|
| Desktop shell | Electron window, menus, main/renderer split, app modes, settings, notifications, diagnostics and modals. | [02-desktop-shell-and-navigation.md](02-desktop-shell-and-navigation.md), [../../architecture/01-system-overview.md](../../architecture/01-system-overview.md) | [electron/main.ts](../../../electron/main.ts), `src/components/`, `src/store/` |
| Navigation | Folder/tree browsing, gallery grid, image viewer, filters, stacks/duplicates/similarity surfaces where wired. | [02-desktop-shell-and-navigation.md](02-desktop-shell-and-navigation.md) | `src/components/`, `src/hooks/` |
| DB engine modes | Main-process database access through PostgreSQL or backend API mode; renderer calls preload/IPC only. | [03-database-engine-modes.md](03-database-engine-modes.md), [../../architecture/02-database-design.md](../../architecture/02-database-design.md) | [electron/db.ts](../../../electron/db.ts), [electron/db/provider.ts](../../../electron/db/provider.ts), [electron/preload.ts](../../../electron/preload.ts) |
| Backend API jobs | Health/status, scoring, tagging, clustering, pipeline submit/control, queue/jobs, scope tree, similarity, import, and raw-preview calls through main-process API service. | [04-backend-api-jobs.md](04-backend-api-jobs.md) | [electron/apiService.ts](../../../electron/apiService.ts), backend [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md) |
| RAW/NEF fallback | Local IPC and backend fallback paths for browser-visible RAW/NEF preview. | [01-nef-raw-fallback.md](01-nef-raw-fallback.md) | [electron/nefExtractor.ts](../../../electron/nefExtractor.ts), [src/utils/nefViewer.ts](../../../src/utils/nefViewer.ts), backend [INBROWSER_RAW_PREVIEW.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/INBROWSER_RAW_PREVIEW.md) |
| JPEG export / EXIF orientation | Exported JPEG raster bake resets EXIF orientation to avoid double-rotation when implemented through the current export path. | [05-jpeg-export-exif-orientation.md](05-jpeg-export-exif-orientation.md) | [src/utils/exportImageBake.ts](../../../src/utils/exportImageBake.ts), [electron/main.ts](../../../electron/main.ts) |
| Sync from device | NEF-oriented source sync/import flow, backend registration/scheduling, and phase status expectations. | [06-sync-from-device-workflow.md](06-sync-from-device-workflow.md) | [electron/main.ts](../../../electron/main.ts), [electron/scheduleProcessing.ts](../../../electron/scheduleProcessing.ts), backend [ELECTRON_SYNC_IMPORT_AND_PHASES.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/ELECTRON_SYNC_IMPORT_AND_PHASES.md) |

## Backend Cross-Links

- [Backend shipped feature catalog](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/INDEX.md)
- [Backend pipeline terminology](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md)
- [Backend API contract](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md)

## Regression Warnings

- Do not add renderer-process DB access.
- Do not change RAW/NEF preview behavior or EXIF/export orientation without regression tests.
- Do not invent backend contracts; update backend canonical docs first.

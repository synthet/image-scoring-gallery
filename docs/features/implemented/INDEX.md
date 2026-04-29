# Features — implemented (catalog)

Routing catalog for the **Electron + Vite** gallery: IPC entry points, optional **FastAPI** calls, and pointers to deep docs. Canonical API/schema/pipeline vocabulary lives in **image-scoring-backend** — start at [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) and [features/implemented/INDEX.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/INDEX.md).

**Planned work:** [../planned/embeddings/README.md](../planned/embeddings/README.md) · [../planned/01-windows-native-viewer.md](../planned/01-windows-native-viewer.md)

| Feature area | Page | Primary code | Backend / data |
|--------------|------|--------------|----------------|
| NEF/RAW preview fallback | [01-nef-raw-fallback.md](01-nef-raw-fallback.md) | `electron/main.ts` (`nef:*`, `fs:*`), viewer | [INBROWSER_RAW_PREVIEW.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/INBROWSER_RAW_PREVIEW.md), `GET /api/raw-preview` |
| Shell, modes, navigation | [02-desktop-shell-and-navigation.md](02-desktop-shell-and-navigation.md) | `electron/main.ts`, `src/components/*` | `/ui/` operator app (sibling backend) |
| Database engines | [03-database-engine-modes.md](03-database-engine-modes.md) | `electron/db.ts`, `electron/db/provider.ts` | [02-database-design.md](../../architecture/02-database-design.md), `POST /api/db/query` |
| Backend jobs & API | [04-backend-api-jobs.md](04-backend-api-jobs.md) | `electron/apiService.ts`, IPC `api:*` | [API_CONTRACT](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md), [implemented/01-pipeline…](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/01-pipeline-and-runs.md) |
| JPEG export & EXIF orientation | [05-jpeg-export-exif-orientation.md](05-jpeg-export-exif-orientation.md) | `src/utils/exportImageBake.ts`, `ImageViewer.tsx`, `electron/main.ts` (`exportCurrentImage`) | RAW preview: [source_image_api.py](https://github.com/synthet/image-scoring-backend/blob/main/modules/ui/source_image_api.py) |

**Stage labels (UI):** [`src/constants/pipelineLabels.ts`](../../../src/constants/pipelineLabels.ts) — keep aligned with backend [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md).

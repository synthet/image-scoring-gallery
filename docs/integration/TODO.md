# API Integration TODO

Tasks for Electron ↔ Python backend integration. See [Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) for protocols (canonical in **image-scoring-backend**; local pointer: [`../technical/AGENT_COORDINATION.md`](../technical/AGENT_COORDINATION.md)).

> **Source of truth & update order:** Integration status mirror (owner: integration maintainers). Reconcile after [`TODO.md`](../../TODO.md) and [`docs/planning/01-roadmap-todo.md`](../planning/01-roadmap-todo.md); if embedding milestones change, then sync [`docs/features/planned/embeddings/TODO.md`](../features/planned/embeddings/TODO.md). Procedure: [`docs/project/00-backlog-workflow.md`](../project/00-backlog-workflow.md).

## REST API

- [x] Migrate `apiService.ts` to use new `/api/similarity/*` endpoints
- [x] Updated `searchSimilar` to `/api/similarity/search`
- [x] Updated `findDuplicates` to `/api/similarity/duplicates`
- [x] Updated `getOutliers` to `/api/similarity/outliers`
- [x] Standardized IPC channel names to `api:similarity:*` namespace
- [x] Updated `main.ts` IPC handlers (`find-duplicates`, `search-similar`, `outliers`)
- [x] Updated `preload.ts` IPC invocations for consistency
- [x] Verified `apiTypes.ts` matches backend (OutlierResponse/OutlierSearchResult identical)
- [ ] Sync `electron/apiTypes.ts` when backend API contract changes

## WebSocket

- [x] Subscribe to `job_progress` for live progress bar (`src/hooks/useGalleryWebSocket.ts` `subscribe('job_progress', ...)`, `src/components/Layout/JobProgressBar.tsx`, `src/store/useJobProgressStore.ts`)
- [x] Ensure `image_updated` and `folder_updated` handlers refresh correct views

## Configuration

- [x] Document `config.api.url` / `config.api.port` override in user-facing docs (`docs/guides/02-api-backend-config.md`)
- [x] Project layout (sibling **image-scoring-backend** / **image-scoring-gallery**) documented in [`CLAUDE.md`](../../CLAUDE.md)

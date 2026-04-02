# API Integration TODO

Tasks for Electron ↔ Python backend integration. See [Agent Coordination](https://github.com/synthet/image-scoring/blob/main/docs/technical/AGENT_COORDINATION.md) for protocols.

> **Source of truth & update order:** Integration status mirror (owner: integration maintainers). Reconcile after `TODO.md` and `docs/planning/01-roadmap-todo.md`; if embedding milestones change, then sync `docs/features/planned/embeddings/TODO.md`.

## REST API

- [ ] Add IPC handlers for new similarity endpoints when backend exposes them (`/api/similarity/*`)
- [ ] Sync `electron/apiTypes.ts` when backend API contract changes

## WebSocket

- [x] Subscribe to `job_progress` for live progress bar (`src/hooks/useGalleryWebSocket.ts` `subscribe('job_progress', ...)`, `src/components/Layout/JobProgressBar.tsx`, `src/store/useJobProgressStore.ts`)
- [x] Ensure `image_updated` and `folder_updated` handlers refresh correct views

## Configuration

- [x] Document `config.api.url` / `config.api.port` override in user-facing docs (`docs/guides/02-api-backend-config.md`)
- [x] Project layout (sibling `image-scoring` / `image-scoring-gallery`) documented in CLAUDE.md

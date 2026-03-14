# API Integration TODO

Tasks for Electron ↔ Python backend integration. See [Agent Coordination](https://github.com/synthet/image-scoring/blob/main/docs/technical/AGENT_COORDINATION.md) for protocols.

> **Source of truth & update order:** Integration status mirror (owner: integration maintainers). Reconcile after `TODO.md` and `docs/planning/01-roadmap-todo.md`; if embedding milestones change, then sync `docs/features/planned/embeddings/TODO.md`.

## REST API

- [ ] Add IPC handlers for new similarity endpoints when backend exposes them (`/api/similarity/*`)
- [ ] Sync `electron/apiTypes.ts` when backend API contract changes

## WebSocket

- [ ] Subscribe to `job_progress` for live progress bar (optional; currently job_started/job_completed only)
- [x] Ensure `image_updated` and `folder_updated` handlers refresh correct views

## Configuration

- [ ] Document `config.api.url` / `config.api.port` override in user-facing docs
- [ ] Project layout (sibling `image-scoring` / `electron-image-scoring`) documented in CLAUDE.md

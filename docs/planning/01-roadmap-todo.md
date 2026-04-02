# TODO - Electron Image Scoring

Consolidated list of unfinished work items. Last Updated: Apr 1, 2026.

> **Source of truth & update order:** Secondary roadmap mirror (owner: planning/docs maintainers). Sync only after `TODO.md`, then reconcile this file before updating `docs/integration/TODO.md` and `docs/features/planned/embeddings/TODO.md`.

---

## Snapshot

- **Total open items**: 14
- **Electron-only items**: 1
- **Cross-repo dependency items** (`[Python]`, `[Gradio]`, `[DB]`, `[DB+Python]`): 13

### Highest-Impact Next Steps

1. **[EIS-105](03-high-impact-tracked-tasks.md#eis-105---execute-embedding-feature-wave-with-backend-coordination)** Deliver the embedding feature wave in backend-ready order.
2. **Consolidate styling into a unified system** so the post-`AppContent.tsx` architecture has a stable UI direction.
3. **Tighten backend integration hygiene** by syncing `electron/apiTypes.ts` with backend changes and adding similarity IPC handlers as backend endpoints land.
4. **Plan Firebird→Postgres provider transition** before expanding deeper backend integration.
5. ~~**[EIS-104](03-high-impact-tracked-tasks.md#eis-104---close-local-quality-debt-prior-to-backend-expansion)**~~ — done (2026-04-01).

---

## Recently Completed

- [x] Harden `media://` path validation (traversal protection)
- [x] Implement Database Connection Pooling (`electron/db.ts`)
- [x] Scale protection for `useImages` (2000 item limit + pagination)
- [x] Centralized REST API client for Python backend (`ApiService.ts`)
- [x] [EIS-101] Harden `useImages` / `useStacks` data-loading race safety
- [x] [EIS-102] Stabilize runtime observability (log rotation/retention + bounded WebSocket reconnect)
- [x] [EIS-103] Decompose `AppContent.tsx` into domain hooks and reduce orchestration complexity
- [x] Expand MCP server tooling scope: consolidated `imgscore-el-gallery`, `gallery_status`, optional FastAPI probes, and optional Electron CDP tools
- [x] [EIS-104] Close local quality debt (see `03-high-impact-tracked-tasks.md`)
- [x] Document `config.api.url` / `config.api.port` behavior in user-facing docs

## P1 - High Priority

- [ ] **Embedding feature integration** [Python]: Add "Find Similar" to context menu and details panel; integrate "Duplicate Finder" into main navigation

## P2 - Medium Priority

- [ ] Consolidate styling into a unified system (CSS Modules or Tailwind)
- [ ] Implement semantic **Tag Propagation** UI [Python]

## P3 - Lower Priority

- [ ] Refactor folder lookup to indexed structure in `useFolders` [DB]
- [x] Cleanup high-impact production `no-explicit-any` / hook smell (EIS-104); broader ESLint baseline still open
- [ ] **2D Embedding Map** [Python]
- [ ] **Outlier Detection** UI [Python]
- [ ] **Smart Stack Representative** [Python]

## Python / Backend Integration

- [ ] [Gradio] Enhance IPC/WebSocket bridge for real-time AI updates with the Python backend
- [ ] [Python] Add IPC handlers for new similarity endpoints when backend exposes them (`/api/similarity/*`)
- [ ] [Python] Sync `electron/apiTypes.ts` when backend API contract changes
- [x] Document `config.api.url` / `config.api.port` override in user-facing docs

## Database & Migration

- [ ] [DB] Evaluate replacement for outdated `node-firebird` driver
- [ ] [DB+Python] Add DB provider abstraction in `electron/db.ts` for Postgres
- [ ] [DB+Python] Migrate Electron from `node-firebird` to Postgres client after Python cutover
- [ ] [DB+Python] Remove Firebird-specific runtime assumptions

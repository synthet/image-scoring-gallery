# TODO - Electron Image Scoring

Project-level task list. Items marked `[Python]`, `[Gradio]`, or `[DB]` involve the Python image-scoring project or database integrations.

> **Source of truth & update order:** This file is the canonical task ledger (owner: Electron maintainers). Update this file first, then sync `docs/planning/01-roadmap-todo.md`, then `docs/integration/TODO.md`, and finally `docs/features/planned/embeddings/TODO.md`.

Last evaluated: 2026-04-01.

| Marker | Use when |
|--------|----------|
| `[Python]` | Requires changes in `D:\Projects\image-scoring` or coordination with Python backend |
| `[Gradio]` | Gradio/WebSocket bridge or real-time AI pipeline integration |
| `[DB]` | Firebird schema, queries, connection layer, or migration |
| `[DB+Python]` | Coordinated DB work across both repos (e.g. Firebird→Postgres migration) |

### Count Snapshot Rules

Use these rules whenever reporting counts in this file (or in linked planning docs):

- **What counts as “open”**: any unchecked checkbox line (`- [ ] ...`) counts as one open item.
- **How grouped checklist items are counted**: each unchecked checkbox line counts independently. If a parent has its own checkbox and child checkboxes, count all unchecked lines (parent + each child).
- **Cross-repo markers**: any open item containing `[Python]`, `[Gradio]`, `[DB]`, or `[DB+Python]` is counted as a **cross-repo dependency item**.
  - Items with none of those markers are counted as **Electron-only**.
  - `[DB+Python]` is a single cross-repo class (do not double-count it as both `[DB]` and `[Python]`).

#### Compact Counting Example (from `Python / Backend Integration`)

- Open items in the section: **5**
- Cross-repo items: **4** (`[Gradio]` ×2, `[Python]` ×2)
- Electron-only items: **1** (`Document config.api.url / config.api.port override in user-facing docs`)
- Check: `open (5) = cross-repo (4) + Electron-only (1)`

---

## Unfinished Business Evaluation (2026-04-01)

### Current Status Snapshot

- **Total open items**: 14
- **Electron-only (unblocked) items**: 1
- **Cross-repo dependency items** (`[Python]`, `[Gradio]`, `[DB]`, `[DB+Python]`): 13

### Highest-Impact Next Steps (Recommended Sequence)

1. **[EIS-105](docs/planning/03-high-impact-tracked-tasks.md#eis-105---execute-embedding-feature-wave-with-backend-coordination) - Execute embedding feature wave with backend coordination** (Tag Propagation → Outlier Detection → 2D Map → Smart Stack Representative).
2. **Consolidate styling into a unified system** (CSS Modules or Tailwind) to reduce UI churn after the `AppContent.tsx` decomposition.
3. **Tighten backend integration hygiene** by keeping `electron/apiTypes.ts` aligned with backend contract changes and adding similarity IPC handlers as backend endpoints land.
4. **Plan the Firebird→Postgres provider transition** (provider abstraction, client cutover, and removal of Firebird-only runtime assumptions) before deeper backend expansion.
5. ~~**[EIS-104](docs/planning/03-high-impact-tracked-tasks.md#eis-104---close-local-quality-debt-prior-to-backend-expansion) - Close local quality debt**~~ — done (2026-04-01).

### Dependency Notes

- **Backend-gated work**: Similarity endpoints, Gradio live progress, and semantic embedding features require coordinated Python API support.
- **Migration-gated work**: Firebird driver replacement and provider abstraction should be planned together with Python's Firebird→Postgres cutover milestones.
- **Docs drift risk**: Keep this file, `docs/planning/01-roadmap-todo.md`, and feature-specific TODO docs synchronized whenever statuses change.

---

## Recently Completed

- [x] Harden `media://` path validation (traversal protection)
- [x] Implement Database Connection Pooling (`electron/db.ts`)
- [x] Scale protection for `useImages` (2000 item limit + pagination)
- [x] Centralized REST API client for Python backend (`ApiService.ts`)
- [x] [EIS-101] Harden `useImages` / `useStacks` data-loading race safety (stable func refs, loadMore stability, filterKey, race tests)
- [x] [EIS-102] Stabilize runtime observability (log rotation/retention via `sessionLogManager.ts` + bounded WebSocket reconnect with exponential backoff, jitter, 50-attempt cap)
- [x] [EIS-103] Decompose `AppContent.tsx` into domain hooks: `useElectronListeners`, `useGalleryNavigation`, `useStacksMode`, `useImageOpener`, `useGalleryWebSocket` (864 → 449 lines)
- [x] Expand MCP server tooling scope: consolidated `imgscore-el-gallery`, `gallery_status`, optional FastAPI probes (`api_*`), and optional Electron CDP tools (`cdp_*`)
- [x] [EIS-104] Close local quality debt: typed diagnostics (`DiagnosticsReport` / `ProcessMemorySnapshot`), RunsPage `input_path`, `apiClient` `window.electron`, `useFolders` deferred mount fetch + `useCallback`
- [x] Document `config.api.url` / `config.api.port` behavior in user-facing docs (`docs/guides/02-api-backend-config.md`)

---

## P1 - High Priority

- [ ] **Embedding feature integration** [Python]: Add "Find Similar" to context menu and details panel; integrate "Duplicate Finder" into main navigation
- [x] Add explicit request token / in-flight guard to `useImages` for pagination races
- [x] Setup Vitest and basic test coverage for hooks/services

---

## P2 - Medium Priority

- [x] Add log rotation and retention for session logs
- [x] Further decompose `AppContent.tsx` into modular domain hooks/components
- [ ] Consolidate styling into a unified system (CSS Modules or Tailwind)
- [ ] Implement semantic **Tag Propagation** UI [Python]: `propagateTags` service, AI Suggestions sidebar in `ImageViewer.tsx`, Accept/Reject interaction logic — backend endpoint ready (`POST /tagging/propagate`)

---

## P3 - Lower Priority

- [ ] Refactor folder lookup to indexed structure in `useFolders` [DB]
- [x] Cleanup high-impact production `no-explicit-any` / hook smell in paths touched for EIS-104 (full-repo ESLint baseline still includes test mocks and other files)
- [ ] **2D Embedding Map** [Python]: Create `EmbeddingMap.tsx`, WebGL visualization of 1280-d vectors projected to 2D, add navigation to map view in `AppContent.tsx`
- [ ] **Outlier Detection** UI [Python]: Add "Show Outliers" toggle to `FilterPanel.tsx`, visual badge in `GalleryGrid.tsx`, connect to backend outlier detection endpoint
- [ ] **Smart Stack Representative** [Python]: Add "Smart Cover" toggle to `SelectionSettings.tsx`, implement centroid-based cover selection in IPC/Backend

---

## Python / Backend Integration [Python] [Gradio]

- [ ] [Gradio] Gradio Integration: Enhance IPC/WebSocket bridge for real-time AI updates — coordinate bidirectional command channel protocol with Python backend (see `image-scoring/TODO.md` → Clustering & Embeddings)
- [x] [Gradio] Subscribe to `job_progress` for live progress bar (`src/hooks/useGalleryWebSocket.ts` `subscribe('job_progress', ...)`, rendered via `src/components/Layout/JobProgressBar.tsx`, state in `src/store/useJobProgressStore.ts`)
- [ ] [Python] Add IPC handlers for new similarity endpoints when backend exposes them (`/api/similarity/*`)
- [ ] [Python] Sync `electron/apiTypes.ts` when backend API contract changes
- [x] Document `config.api.url` / `config.api.port` override in user-facing docs
- [x] [Python] Ensure `image_updated` and `folder_updated` handlers refresh correct views

---

## Database & Migration [DB]

- [ ] [DB] Outdated `node-firebird` driver: evaluate `node-firebird-driver-native` or typed schema wrapper
- [ ] [DB+Python] Phase 4 (Firebird→Postgres): Add DB provider abstraction in `electron/db.ts` for Postgres
- [ ] [DB+Python] Migrate Electron from `node-firebird` to Postgres client after Python cutover
- [ ] [DB+Python] Remove Firebird-specific runtime assumptions (port checks, auto-start server path, Firebird-only SQL)

---

## Technical Debt (Code Design Review)

- [x] Unbounded WebSocket reconnection backoff: add max retries, exponential backoff, connection jitter
- [x] Race conditions in `useImages` / `useStacks`: fix closure capture in `loadMore()`, `JSON.stringify` deps in `useEffect`
- [x] MCP server: expand tooling scope (`gallery_status`, optional FastAPI probes, optional Electron CDP tools)

---

## References

- [Roadmap / Planning](docs/planning/01-roadmap-todo.md)
- [Firebird→PostgreSQL Migration](docs/planning/02-firebird-postgresql-migration.md)
- [API Integration TODO](docs/integration/TODO.md)
- [Embedding Features TODO](docs/features/planned/embeddings/TODO.md)
- [Code Design Review](docs/reports/01-code-design-review-2026-03.md)
- [High-Impact Tracked Tasks](docs/planning/03-high-impact-tracked-tasks.md)

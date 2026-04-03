# TODO - Electron Image Scoring

**Last evaluated:** 2026-04-02

Project-level task list. Items marked `[Python]`, `[Gradio]`, or `[DB]` involve the Python backend or database integrations. The backend’s root [`TODO.md`](https://github.com/synthet/image-scoring-backend/blob/main/TODO.md) uses **`[Electron]`** for work in this repo — same cross-repo pairs, opposite perspective.

**How to use this file:** See [`docs/project/00-backlog-workflow.md`](docs/project/00-backlog-workflow.md) for source-of-truth rules, mirror sync order, tracking habits, and hygiene ([`BACKLOG_GOVERNANCE.md`](docs/project/BACKLOG_GOVERNANCE.md) is an alias). Twin in **image-scoring-backend**: **[`docs/project/00-backlog-workflow.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/00-backlog-workflow.md)** ([`BACKLOG_GOVERNANCE.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/project/BACKLOG_GOVERNANCE.md) there is an alias).

> **Source of truth & update order:** Canonical task ledger (owner: Electron maintainers). Update this file first, then sync `docs/planning/01-roadmap-todo.md`, then `docs/integration/TODO.md`, and finally `docs/features/planned/embeddings/TODO.md` — full order in [`docs/project/00-backlog-workflow.md`](docs/project/00-backlog-workflow.md).

| Marker | Use when |
|--------|----------|
| `[Python]` | Requires changes in the Python backend repo (sibling `image-scoring-backend`) or API coordination |
| `[Gradio]` | Gradio/WebSocket bridge or real-time AI pipeline integration |
| `[DB]` | Database schema, queries, or connector layer in this app (`pg` / `api`) |
| `[DB+Python]` | Coordinated DB work across gallery + Python backend (e.g. schema or API contract) |

### Count Snapshot Rules

Use these rules whenever reporting counts in this file (or in linked planning docs):

- **What counts as “open”**: any unchecked checkbox line (`- [ ] ...`) counts as one open item.
- **How grouped checklist items are counted**: each unchecked checkbox line counts independently. If a parent has its own checkbox and child checkboxes, count all unchecked lines (parent + each child).
- **Cross-repo markers**: any open item containing `[Python]`, `[Gradio]`, `[DB]`, or `[DB+Python]` is counted as a **cross-repo dependency item**.
  - Items with none of those markers are counted as **Electron-only**.
  - `[DB+Python]` is a single cross-repo class (do not double-count it as both `[DB]` and `[Python]`).

#### Compact Counting Example (illustrative)

If a section had five open lines — four tagged `[Python]`/`[Gradio]` and one with no marker — then: open **5** = cross-repo **4** + Electron-only **1**. Recompute from the current checklist whenever you update the snapshot above.

---

## Unfinished Business Evaluation (2026-04-02)

### Current Status Snapshot

- **Total open items**: 10
- **Electron-only (unblocked) items**: 1
- **Cross-repo dependency items** (`[Python]`, `[Gradio]`, `[DB]`, `[DB+Python]`): 9

### Highest-Impact Next Steps (Recommended Sequence)

1. **[EIS-105](docs/planning/03-high-impact-tracked-tasks.md#eis-105---execute-embedding-feature-wave-with-backend-coordination) - Execute embedding feature wave with backend coordination** (Tag Propagation → Outlier Detection → 2D Map → Smart Stack Representative).
2. **Consolidate styling into a unified system** (CSS Modules or Tailwind) to reduce UI churn after the `AppContent.tsx` decomposition.
3. **Tighten backend integration hygiene** by keeping `electron/apiTypes.ts` aligned with backend contract changes and adding similarity IPC handlers as backend endpoints land.
4. **Residual Postgres-era cleanup** — align user-facing copy, `README.md`, and `config.example.json` with PostgreSQL-only operation (remove misleading Firebird-era strings where they still appear).
5. ~~**[EIS-104](docs/planning/03-high-impact-tracked-tasks.md#eis-104---close-local-quality-debt-prior-to-backend-expansion) - Close local quality debt**~~ — done (2026-04-01).

### Dependency Notes

- **Backend-gated work**: Similarity endpoints, Gradio bridge milestones, and semantic embedding features require coordinated Python API support ([Agent Coordination](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md)).
- **Database stack**: Production Electron paths use **`pg`** (local Postgres) or **`api`** (HTTP SQL to the backend). Firebird is decommissioned; see [migration doc](docs/planning/02-firebird-postgresql-migration.md).
- **Docs drift risk**: Keep this file, `docs/planning/01-roadmap-todo.md`, and feature-specific TODO docs synchronized whenever statuses change. Follow [`docs/project/00-backlog-workflow.md`](docs/project/00-backlog-workflow.md).

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
- [ ] **2D Embedding Map** [Python]: Extend `EmbeddingMap.tsx` (currently a placeholder scaffold) with projection pipeline, WebGL/canvas visualization of 1280-d vectors projected to 2D, and map UX in `AppContent.tsx`
- [ ] **Outlier Detection** UI [Python]: Add "Show Outliers" toggle to `FilterPanel.tsx`, visual badge in `GalleryGrid.tsx`, connect to backend outlier detection endpoint
- [ ] **Smart Stack Representative** [Python]: Add "Smart Cover" toggle to `SelectionSettings.tsx`, implement centroid-based cover selection in IPC/Backend

---

## Python / Backend Integration [Python] [Gradio]

- [ ] [Gradio] Gradio Integration: Enhance IPC/WebSocket bridge for real-time AI updates — coordinate bidirectional command channel protocol with Python backend (see sibling **`image-scoring-backend`/TODO.md** → Clustering & Embeddings)
- [x] [Gradio] Subscribe to `job_progress` for live progress bar (`src/hooks/useGalleryWebSocket.ts` `subscribe('job_progress', ...)`, rendered via `src/components/Layout/JobProgressBar.tsx`, state in `src/store/useJobProgressStore.ts`)
- [ ] [Python] Add IPC handlers for new similarity endpoints when backend exposes them (`/api/similarity/*`)
- [ ] [Python] Sync `electron/apiTypes.ts` when backend API contract changes
- [x] Document `config.api.url` / `config.api.port` override in user-facing docs
- [x] [Python] Ensure `image_updated` and `folder_updated` handlers refresh correct views

---

## Database & Migration [DB]

- [x] Finalize Firebird decommissioning in Electron app:
    - [x] Remove legacy `engine: firebird` mapping in `provider.ts`.
    - [x] Remove `RETURNING` syntax fallbacks in `db.ts` (Postgres supports it).
    - [x] Remove Firebird system table checks (`RDB$RELATION_NAME`) in `db.ts`.
    - [x] Update tests to reflect removal of `firebird` support.
    - [x] Confirm all 115+ tests pass with Postgres-only logic.
- [x] [DB+Python] Phase 4 (Firebird→Postgres): DB provider abstraction (`electron/db/provider.ts`), `pg` driver, removal of `node-firebird` and Firebird runtime assumptions (completed 2026-03/04; see [migration plan](docs/planning/02-firebird-postgresql-migration.md)).

---

## Technical Debt (Code Design Review)

- [x] Unbounded WebSocket reconnection backoff: add max retries, exponential backoff, connection jitter
- [x] Race conditions in `useImages` / `useStacks`: fix closure capture in `loadMore()`, `JSON.stringify` deps in `useEffect`
- [x] MCP server: expand tooling scope (`gallery_status`, optional FastAPI probes, optional Electron CDP tools)

---

## References

- [Backlog workflow (how to pick & track tasks)](docs/project/00-backlog-workflow.md)
- [Roadmap / Planning](docs/planning/01-roadmap-todo.md)
- [Firebird→PostgreSQL Migration](docs/planning/02-firebird-postgresql-migration.md)
- [API Integration TODO](docs/integration/TODO.md)
- [Embedding Features TODO](docs/features/planned/embeddings/TODO.md)
- [Code Design Review](docs/reports/01-code-design-review-2026-03.md)
- [High-Impact Tracked Tasks](docs/planning/03-high-impact-tracked-tasks.md)

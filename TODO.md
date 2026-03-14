# TODO - Electron Image Scoring

Project-level task list. Items marked `[Python]`, `[Gradio]`, or `[DB]` involve the Python image-scoring project or database integrations.

Last evaluated: 2026-03-14.

| Marker | Use when |
|--------|----------|
| `[Python]` | Requires changes in `D:\Projects\image-scoring` or coordination with Python backend |
| `[Gradio]` | Gradio/WebSocket bridge or real-time AI pipeline integration |
| `[DB]` | Firebird schema, queries, connection layer, or migration |
| `[DB+Python]` | Coordinated DB work across both repos (e.g. Firebird→Postgres migration) |

---

## Unfinished Business Evaluation (2026-03-14)

### Current Status Snapshot

- **Total open items**: 21
- **Electron-only (unblocked) items**: 7
- **Cross-repo dependency items** (`[Python]`, `[Gradio]`, `[DB]`, `[DB+Python]`): 14

### Highest-Impact Next Steps (Recommended Sequence)

1. **Harden data-loading race safety in `useImages`** (request token / in-flight guard) to reduce duplicate pagination fetches and stale UI updates.
2. **Stabilize runtime observability** (log rotation/retention + bounded WebSocket reconnect policy) to keep long-running sessions predictable.
3. **Decompose `AppContent.tsx` and align styling strategy** to lower feature-delivery friction before adding more embedding UI surfaces.
4. **Close remaining local quality debt** (`no-explicit-any`, `useImages`/`useStacks` closure and dependency issues) so future backend integrations are lower-risk.
5. **Execute embedding feature wave with backend coordination** (Tag Propagation → Outlier Detection → 2D Map → Smart Stack Representative).

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

---

## P1 - High Priority

- [ ] **Embedding feature integration** [Python]: Add "Find Similar" to context menu and details panel; integrate "Duplicate Finder" into main navigation
- [ ] Add explicit request token / in-flight guard to `useImages` for pagination races
- [x] Setup Vitest and basic test coverage for hooks/services

---

## P2 - Medium Priority

- [ ] Add log rotation and retention for session logs
- [ ] Further decompose `AppContent.tsx` into modular domain hooks/components
- [ ] Consolidate styling into a unified system (CSS Modules or Tailwind)
- [ ] Implement semantic **Tag Propagation** UI [Python]: `propagateTags` service, AI Suggestions sidebar in `ImageViewer.tsx`, Accept/Reject interaction logic

---

## P3 - Lower Priority

- [ ] Refactor folder lookup to indexed structure in `useFolders` [DB]
- [ ] Cleanup remaining lint/type warnings (`no-explicit-any`)
- [ ] **2D Embedding Map** [Python]: Create `EmbeddingMap.tsx`, WebGL visualization of 1280-d vectors projected to 2D, add navigation to map view in `AppContent.tsx`
- [ ] **Outlier Detection** UI [Python]: Add "Show Outliers" toggle to `FilterPanel.tsx`, visual badge in `GalleryGrid.tsx`, connect to backend outlier detection endpoint
- [ ] **Smart Stack Representative** [Python]: Add "Smart Cover" toggle to `SelectionSettings.tsx`, implement centroid-based cover selection in IPC/Backend

---

## Python / Backend Integration [Python] [Gradio]

- [ ] [Gradio] Gradio Integration: Enhance IPC/WebSocket bridge for real-time AI updates
- [ ] [Gradio] Subscribe to `job_progress` for live progress bar (optional; currently job_started/job_completed only)
- [ ] [Python] Add IPC handlers for new similarity endpoints when backend exposes them (`/api/similarity/*`)
- [ ] [Python] Sync `electron/apiTypes.ts` when backend API contract changes
- [ ] Document `config.api.url` / `config.api.port` override in user-facing docs

---

## Database & Migration [DB]

- [ ] [DB] Outdated `node-firebird` driver: evaluate `node-firebird-driver-native` or typed schema wrapper
- [ ] [DB+Python] Phase 4 (Firebird→Postgres): Add DB provider abstraction in `electron/db.ts` for Postgres
- [ ] [DB+Python] Migrate Electron from `node-firebird` to Postgres client after Python cutover
- [ ] [DB+Python] Remove Firebird-specific runtime assumptions (port checks, auto-start server path, Firebird-only SQL)

---

## Technical Debt (Code Design Review)

- [ ] Unbounded WebSocket reconnection backoff: add max retries, exponential backoff, connection jitter
- [ ] Race conditions in `useImages` / `useStacks`: fix closure capture in `loadMore()`, `JSON.stringify` deps in `useEffect`
- [ ] MCP server: expand tooling scope (DB query tools, image caching controls)

---

## References

- [Roadmap / Planning](docs/planning/01-roadmap-todo.md)
- [Firebird→PostgreSQL Migration](docs/planning/02-firebird-postgresql-migration.md)
- [API Integration TODO](docs/integration/TODO.md)
- [Embedding Features TODO](docs/features/planned/embeddings/TODO.md)
- [Code Design Review](docs/reports/01-code-design-review-2026-03.md)

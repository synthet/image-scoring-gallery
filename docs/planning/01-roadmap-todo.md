# TODO - Electron Image Scoring

Consolidated list of unfinished work items. Last Updated: Mar 14, 2026.

> **Source of truth & update order:** Secondary roadmap mirror (owner: planning/docs maintainers). Sync only after `TODO.md`, then reconcile this file before updating `docs/integration/TODO.md` and `docs/features/planned/embeddings/TODO.md`.

---

## Count Snapshot Rules (Shared with `TODO.md`)

Use these rules for any count snapshots in this document:

- **What counts as “open”**: any unchecked checkbox line (`- [ ] ...`) counts as one open item.
- **How grouped checklist items are counted**: each unchecked checkbox line counts independently. If a parent has its own checkbox and child checkboxes, count all unchecked lines (parent + each child).
- **Cross-repo markers**: any open item containing `[Python]`, `[Gradio]`, `[DB]`, or `[DB+Python]` is counted as a **cross-repo dependency item**.
  - Items with none of those markers are counted as **Electron-only**.
  - `[DB+Python]` is a single cross-repo class (do not double-count it as both `[DB]` and `[Python]`).

### Compact Counting Example (from `P1 (High Priority)`)

- Open items in this section: **5** (Gradio Pipeline + Embedding parent + 2 child items + request token; Vitest and handlers completed)
- Cross-repo items: **3** (Embedding parent + 2 children with `[Python]`)
- Electron-only items: **2** (Gradio Pipeline, request token)
- Check: `open (5) = cross-repo (3) + Electron-only (2)`

---

## ✅ Completed (Recently)

- [x] Harden `media://` path validation (traversal protection)
- [x] Implement Database Connection Pooling (`electron/db.ts`)
- [x] Scale protection for `useImages` (2000 item limit + pagination)
- [x] Standardized IPC error handling envelope `{ ok, data, error }`
- [x] Efficient NEF buffer serialization (native Buffer passing)
- [x] Implement global React Error Boundary (`src/main.tsx`)
- [x] Patched `node-firebird` crash & added `postinstall` safeguard
- [x] Initial Image Import UI with deduplication (`ImportModal.tsx`)
- [x] Centralized REST API client for Python backend (`ApiService.ts`)

## P1 (High Priority)

- [ ] Migrate Gradio Pipeline UI into Electron **Processing** workspace (menu entry, phase controls, logs, queue status)
- [ ] **Embedding Feature Integration** [Python]:
    - [ ] Add "Find Similar" to context menu and details panel
    - [ ] Integrate "Duplicate Finder" into main navigation
- [ ] Add explicit request token / in-flight guard to `useImages` for pagination races
- [x] Setup `Vitest` and basic test coverage for hooks/services
- [x] Ensure `image_updated` and `folder_updated` handlers refresh correct views

## P2 (Medium Priority)

- [ ] Add log rotation and retention for session logs
- [ ] Further decompose `AppContent.tsx` into modular domain hooks/components
- [ ] Consolidate styling into a unified system (CSS Modules or Tailwind)
- [ ] Implement semantic "Tag Propagation" UI from similar images

## P3 (Lower Priority)

- [ ] Refactor folder lookup to indexed structure in `useFolders`
- [ ] Cleanup remaining lint/type warnings (`no-explicit-any`)
- [ ] 2D Embedding Map (WebGL visualization)
- [ ] Outlier Detection UI
- [ ] Smart Stack Representative

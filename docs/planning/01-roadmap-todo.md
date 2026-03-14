# TODO - Electron Image Scoring

Consolidated list of unfinished work items. Last Updated: Mar 10, 2026.

---

## Count Snapshot Rules (Shared with `TODO.md`)

Use these rules for any count snapshots in this document:

- **What counts as “open”**: any unchecked checkbox line (`- [ ] ...`) counts as one open item.
- **How grouped checklist items are counted**: each unchecked checkbox line counts independently. If a parent has its own checkbox and child checkboxes, count all unchecked lines (parent + each child).
- **Cross-repo markers**: any open item containing `[Python]`, `[Gradio]`, `[DB]`, or `[DB+Python]` is counted as a **cross-repo dependency item**.
  - Items with none of those markers are counted as **Electron-only**.
  - `[DB+Python]` is a single cross-repo class (do not double-count it as both `[DB]` and `[Python]`).

### Compact Counting Example (from `P1 (High Priority)`)

- Open items in this section: **4** (Embedding parent + 2 child items + request token item; Vitest is completed)
- Cross-repo items: **0**
- Electron-only items: **4**
- Check: `open (4) = cross-repo (0) + Electron-only (4)`

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

- [ ] **Embedding Feature Integration**:
    - [ ] Add "Find Similar" to context menu and details panel
    - [ ] Integrate "Duplicate Finder" into main navigation
- [ ] Add explicit request token / in-flight guard to `useImages` for pagination races
- [x] Setup `Vitest` and basic test coverage for hooks/services

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

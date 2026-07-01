---
type: "Plan"
title: "Codebase size refactor plan"
description: "Phased checklist to reduce files ≥1000 LoC and functions ≥150 LoC in image-scoring-gallery."
resource: "docs/planning/CODEBASE_SIZE_REFACTOR_PLAN.md"
tags: ["gallery-docs", "planning", "refactoring"]
timestamp: 2026-07-01T00:00:00Z
okf_version: 0.1
---

# Codebase size refactor plan (gallery)

Phased checklist to reduce files ≥1000 LoC and functions/methods ≥150 LoC in **image-scoring-gallery**. Derived from the latest `codebase_size_audit.py` run (via sibling backend script).

**Last audit:** 2026-07-01  
**Thresholds:** files ≥1000 LoC, functions/methods ≥150 LoC  
**Sibling plan:** [image-scoring-backend CODEBASE_SIZE_REFACTOR_PLAN.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/refactoring/CODEBASE_SIZE_REFACTOR_PLAN.md)  
**Re-run audit:** [backend `.cursor/skills/codebase-size-audit/SKILL.md`](https://github.com/synthet/image-scoring-backend/blob/main/.cursor/skills/codebase-size-audit/SKILL.md)

```bash
# From image-scoring-backend root (gallery path adjustable)
python scripts/audit/codebase_size_audit.py --root ../image-scoring-gallery
python scripts/audit/codebase_size_audit.py --root ../image-scoring-gallery --format json -o .agent/scratch/audit-gallery.json
```

---

## Backlog contract

> **This document is informational.** Implementing any phase below requires filing and claiming a GitHub Project board issue first (see [docs/project/00-backlog-workflow.md](../project/00-backlog-workflow.md) and `.cursor/skills/backlog-queue/SKILL.md`). Move the card to **In Progress** on the first commit; reference `Closes #<N>` in the PR.

---

## Ground rules (all phases)

- **Mechanical extraction only** — move code into sibling modules; no behavior changes in the same PR unless fixing a bug found during extraction.
- **Stable IPC contract** — **never** rename IPC channel strings or change `preload.ts` / renderer types without a coordinated PR (see `.cursor/skills/gallery-electron-ts/SKILL.md`).
- **Barrel re-exports** — keep `electron/db.ts` and existing import paths working for `main.ts` and IPC handlers.
- **Test after every phase** — `npm run test:run`, `npx tsc --noEmit`, `npx tsc -p electron/tsconfig.json --noEmit`.
- **Re-audit after every phase** — re-run audit script from backend repo; update checkboxes and record new line counts.
- **Risk labels:** **Safe** = internal module split; **High** = IPC/renderer/NEF/EXIF regression surface.

---

## Phase 1 — Batch 1 recap (done) + remaining `electron/main.ts`

Post-Batch-1 line counts (2026-06-30):

| Area | Action | Result (LoC) |
|------|--------|-------------:|
| `electron/main.ts` | Extracted sync, backup, db IPC → `electron/ipc/register*.ts` | **1,623** (file) |
| `startFullApplication` | Still monolithic | **711** (L874–1584) |
| `rebuildApplicationMenu` | Still in main | **162** (L514–675) |
| `electron/db.ts` | Not touched in Batch 1 | **2,601** |

Batch 1 (done):

- [x] Extract sync IPC → `electron/ipc/registerSyncHandlers.ts` (587 LoC register fn — further split optional)
- [x] Extract backup IPC → `electron/ipc/registerBackupHandlers.ts` (450 LoC register fn — further split optional)
- [x] Extract DB IPC → `electron/ipc/registerDbHandlers.ts` (206 LoC)
- [x] Re-run audit; confirm `main.ts` **1,623 LoC**

Remaining extractions (**Safe** if channel names unchanged) — **done** (Closes [#151](https://github.com/synthet/image-scoring-gallery/issues/151)):

- [x] **Gate:** Issue for main-process IPC/menu split ([#151](https://github.com/synthet/image-scoring-gallery/issues/151))
- [x] Extract `import:run` handlers → `electron/ipc/registerImportHandlers.ts`
- [x] Extract `nef:*`, `fs:*` handlers → `electron/ipc/registerNefFsHandlers.ts`; media protocol → `electron/ipc/registerMediaProtocol.ts`
- [x] Extract `app:*`, `export:*`, `system:*`, `debug:*` → `registerAppHandlers.ts`, `registerSystemHandlers.ts`
- [x] Extract `api:*` (38 handlers) → `electron/ipc/registerApiHandlers.ts`
- [x] Extract FS/metadata helpers → `electron/fsMetadataHelpers.ts`; export flow → `electron/exportImage.ts`
- [x] Extract `rebuildApplicationMenu` → `electron/menu.ts`
- [x] Slim `startFullApplication` — delegate to register* calls + startup sequence only
- [x] No preload / channel renames; run electron TS check + Vitest (431 tests passed)
- [x] Re-run audit; target `main.ts` **<1000 LoC**, `startFullApplication` **<200 LoC** — record: **435** / **100** (L301–400)

---

## Phase 2 — `electron/db.ts` domain decomposition

**Risk: High** — IPC result shapes consumed by renderer; mirror backend [db-refactor-decomposition](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/db-refactor-decomposition.md).

| Target | LoC |
|--------|----:|
| File `electron/db.ts` | 2,601 |

Domain groups (from exports):

| Module | Responsibilities |
|--------|------------------|
| `electron/db/connection.ts` | `connectDB`, `closeConnection`, `initializeDatabaseProvider`, `checkConnection`, `query`, `runTransaction` |
| `electron/db/images.ts` | `getImages*`, `getImageCount`, `getImageDetails`, `insertImage`, `updateImageDetails`, `deleteImage`, `findImageBy*`, deleted-image helpers |
| `electron/db/folders.ts` | `getFolders`, `getFolderPathById`, `getOrCreateFolder`, `deleteFolder`, `normalizePathForDb` |
| `electron/db/phases.ts` | `getImagePhaseStatuses`, `markImage*PhasesPending`, `SCHEDULE_PENDING_PHASE_CODES`, `ALL_PIPELINE_PHASE_CODES` |
| `electron/db/keywords.ts` | `getKeywords`, `getKeywordCloud`, `syncImageKeywords`, `invalidateKeywordsCache` |
| `electron/db/stacks.ts` | `getStacks`, `getImagesByStack*`, `getSubstacksForStack`, stack cache (`ensureStackCacheTable`, `rebuildStackCache`, …) |
| `electron/db/backup.ts` | `getAllScoredImagesForBackup`, `countScoredImagesForBackup`, `getImageDetailsBatch` |
| `electron/db/similarity.ts` | `getEmbeddingsBatch`, `getSimilarPairsInGroup` |
| `electron/db/thumbnails.ts` | `resolveThumbnailPathForDisplay` |

- [ ] **Gate:** Issue; confirm `electron/db/provider.ts` boundaries unchanged
- [ ] Create `electron/db/` modules per table above
- [ ] Keep `electron/db.ts` as barrel re-export (no import churn in `main.ts` / IPC)
- [ ] Run `npx tsc -p electron/tsconfig.json --noEmit` + IPC integration tests
- [ ] Re-run audit; target `db.ts` barrel **<300 LoC**, largest domain file **<800 LoC** — record: ___

---

## Phase 3 — `src/AppContent.tsx`

**Risk: Medium** — 34 hooks; state coupling across gallery, viewer, filters.

| Target | LoC | Range |
|--------|----:|-------|
| `AppContent` | 919 | L49–967 |

- [ ] **Gate:** Issue; map hook groups (filters, viewer navigation, selection, stacks mode)
- [ ] Extract `useGalleryFilters` (or equivalent) hook module
- [ ] Extract `useViewerNavigation` hook module
- [ ] Extract `useSelectionState` hook module
- [ ] Split JSX into subcomponents (toolbar, grid shell, viewer shell)
- [ ] Coordinate with `.cursor/skills/gallery-ui/SKILL.md`
- [ ] Add/update Vitest for extracted hooks where behavior is non-obvious
- [ ] Re-run audit; target `AppContent` **<300 LoC** — record: ___

---

## Phase 4 — `src/components/Viewer/ImageViewer.tsx`

**Risk: High — regression-sensitive** — NEF/RAW preview and JPEG EXIF orientation (see [docs/features/implemented/01-nef-raw-fallback.md](../features/implemented/01-nef-raw-fallback.md), [05-jpeg-export-exif-orientation.md](../features/implemented/05-jpeg-export-exif-orientation.md)).

| Target | LoC |
|--------|----:|
| File `ImageViewer.tsx` | 1,746 |

- [ ] **Gate:** Issue + explicit regression checklist from EXIF/NEF docs
- [ ] Extract metadata panel subcomponent
- [ ] Extract controls / toolbar subcomponent
- [ ] Extract zoom-pan logic hook
- [ ] Extract export flow subcomponent/hook
- [ ] Run Vitest + manual NEF/EXIF regression pass documented in AGENTS.md
- [ ] Re-run audit; target file **<1000 LoC** — record: ___

---

## Phase 5 — `server/index.ts`

**Risk: Medium** — dev server routes used by web-only mode.

| Target | LoC | Range |
|--------|----:|-------|
| `createServerApp` | 412 | L55–466 |

- [ ] Split route registration by concern (static, API proxy, health, …)
- [ ] Keep exported `createServerApp` signature stable
- [ ] Run `npm run test:run` if server tests exist; `npx tsc --noEmit`
- [ ] Re-run audit; target `createServerApp` **<150 LoC** — record: ___

---

## Phase 6 — `src/bridge.ts`

**Risk: Medium** — HTTP bridge used when not on Electron IPC.

| Target | LoC | Range |
|--------|----:|-------|
| `createHttpBridge` | 271 | L207–477 |

- [ ] Split bridge handlers by domain (images, folders, stacks, …)
- [ ] Keep `createHttpBridge` return shape stable for consumers
- [ ] Run renderer typecheck + relevant Vitest
- [ ] Re-run audit; target **<150 LoC** — record: ___

---

## Phase 7 — `mcp-server/src/tools/cdp.ts`

**Risk: Safe** — MCP CDP dispatch; isolated from gallery IPC.

| Target | LoC | Range |
|--------|----:|-------|
| `handleCdpTool` | 164 | L284–447 |

- [ ] Split action dispatch into per-action handler map/functions
- [ ] Rebuild MCP registry if needed (`npm run build:registry` in `mcp-server/`)
- [ ] Re-run audit; target **<80 LoC** dispatch shell — record: ___

---

## Phase 8 — Verification and guardrails

- [ ] All phases complete or deferred with issue links
- [ ] `npm run test:run`
- [ ] `npx tsc --noEmit`
- [ ] `npx tsc -p electron/tsconfig.json --noEmit`
- [ ] `npm run lint` (fix only regressions in touched files)
- [ ] Re-run gallery audit; confirm no file ≥1000 LoC except grandfather list
- [ ] _(Optional)_ ESLint `max-lines` / `max-lines-per-function` scoped to `electron/`, `src/` with grandfather entries for deferred files
- [ ] Update **Last audit** date in this document

**Optional follow-up (Batch 1 IPC register fns still large):**

- [ ] Split `registerSyncHandlers` (587 LoC) into thematic register helpers (**Safe**)
- [ ] Split `registerBackupHandlers` (450 LoC) similarly (**Safe**)

---

## Related documents

- [db_abstraction_layer.md](db_abstraction_layer.md) — provider refactor notes
- [Backend codebase size plan](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/refactoring/CODEBASE_SIZE_REFACTOR_PLAN.md)
- [Backend db-refactor-decomposition](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/db-refactor-decomposition.md)

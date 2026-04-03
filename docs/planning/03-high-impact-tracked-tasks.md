# High-Impact Next Steps - Tracked Tasks

Source: `TODO.md` → **Highest-Impact Next Steps (Recommended Sequence)**.

These tracked tasks are the auditable execution records for the five highest-impact items and include explicit boundaries, cross-repo dependencies, definition of done, and ownership suggestions.

## EIS-101 - Harden `useImages` data-loading race safety ✅ DONE (2026-03-15)

- **Source item**: "Harden data-loading race safety in `useImages` (request token / in-flight guard)"
- **Suggested owner/team**: Electron Frontend (Gallery/Hooks)
- **Completed**: 2026-03-15
- **Changes made**:
  - Added stable refs (`fetchFuncRef`, `countFuncRef`, `getUniqueKeyRef`) in `usePaginatedData` so `loadMore`/`refresh` never close over stale function instances.
  - `loadMore` `useCallback` deps reduced to `[pageSize, trimItems]`; all other state read via refs at call time.
  - Added `loadMoreRef` so the initial-load `useEffect` does not list `loadMore` as a dep (preventing spurious re-runs on every render).
  - Replaced inline `JSON.stringify(filters)` expression in `useEffect` deps with a computed `filterKey` variable.
  - `dedupeItems` stabilised (`[]` deps) by using `getUniqueKeyRef`.
  - `refresh` deps reduced to `[dedupeItems, pageSize, trimItems]`; `countFunc`/`fetchFunc`/`loadMore` removed (now read via refs).
  - Added `src/hooks/useImages.race.test.tsx` with three tests: stale-response guard, concurrent-request in-flight guard, and folder-switch stale-response guard.
- **Scope boundaries**:
  - In scope:
    - Add request token or generation guard in `useImages` pagination flow.
    - Add in-flight dedupe guard to prevent duplicate concurrent fetches.
    - Ensure stale responses cannot overwrite fresher state.
    - Add focused unit/integration coverage for race scenarios.
  - Out of scope:
    - Re-architecting all data hooks.
    - Backend API contract changes.
- **Dependencies (backend/migration)**:
  - Backend: None required (client-side correctness hardening).
  - Migration: None.
- **Definition of done**:
  - [x] Reproduction scenario for duplicate pagination/stale overwrite is no longer reproducible.
  - [x] Existing hook behavior remains unchanged for normal load path.
  - [x] Tests cover at least one stale-response and one concurrent-request scenario.
  - [x] TODO references updated with completion status.

## EIS-102 - Stabilize runtime observability ✅ DONE (2026-03-16)

- **Source item**: "Stabilize runtime observability (log rotation/retention + bounded WebSocket reconnect policy)"
- **Suggested owner/team**: Electron Platform + Runtime
- **Completed**: 2026-03-16
- **Changes made**:
  - `electron/sessionLogManager.ts` — size-based rotation (5 MB/file), ISO date naming (`session_YYYY-MM-DD.log`), 14-day retention, 200-file cap, 5-minute periodic cleanup. IPC handler wired in `electron/main.ts` (lines 626-649). Tests in `electron/sessionLogManager.test.ts`.
  - `src/services/WebSocketService.ts` — exponential backoff starting at 1 s, capped at 30 s, ±20% jitter, 50-attempt max. Every attempt and terminal state logged. Tests in `src/services/WebSocketService.test.ts`.
- **Scope boundaries**:
  - In scope:
    - Add log rotation/retention policy for session logs.
    - Implement bounded reconnect strategy (max retries + backoff + jitter) for WebSocket clients.
    - Add runtime configuration knobs (reasonable defaults).
  - Out of scope:
    - End-to-end telemetry pipeline or external log aggregation.
    - Replacing current transport protocol.
- **Dependencies (backend/migration)**:
  - Backend: Optional coordination if reconnect semantics need backend-side rate limiting hints.
  - Migration: None.
- **Definition of done**:
  - [x] Long-running session log growth is bounded by policy.
  - [x] WebSocket reconnect attempts are bounded and observable in logs.
  - [x] Manual failure test demonstrates backoff/jitter and clean terminal state after max retries (covered by `WebSocketService.test.ts`).
  - [x] TODO references updated with completion status.

## EIS-103 - Decompose `AppContent.tsx` + styling strategy alignment ✅ DONE (2026-03-16)

- **Source item**: "Decompose `AppContent.tsx` and align styling strategy"
- **Suggested owner/team**: Electron Frontend Architecture
- **Completed**: 2026-03-16
- **Changes made**:
  - `src/hooks/useElectronListeners.ts` — IPC menu listener registration (onOpenSettings, onOpenDuplicates, onOpenProcessing, onImportFolderSelected, onShowNotification) with modal/view state.
  - `src/hooks/useGalleryNavigation.ts` — folder selection, subfolder toggle, `currentFolder`, `subfolderIds`, breadcrumb chain, parent navigation.
  - `src/hooks/useStacksMode.ts` — stacks mode toggle, activeStackId, stackImages loading, stack cache rebuild, handleSelectStack, handleImageDeleteFromStack.
  - `src/hooks/useImageOpener.ts` — viewer lifecycle: open/navigate/delete images, pending image resolution on folder switch, `openImageById`, `handleFindSimilarFromGrid`.
  - `src/hooks/useGalleryWebSocket.ts` — WebSocket subscription, 500 ms debounced refresh scheduling, all event type handlers (stack_created, job lifecycle, image/folder updates).
  - `src/AppContent.tsx` — reduced from 864 → 449 lines; now an orchestrator that wires hooks and renders JSX with no inline business logic.
- **Styling strategy**: No visual changes in this pass. Strategy documented: CSS Modules for interactive elements requiring pseudo-state (`:hover`, `:focus-visible`, `[aria-checked]`); inline styles acceptable for layout scaffolding. A dedicated styling-pass milestone should be tracked separately.
- **Scope boundaries**:
  - In scope:
    - Split `AppContent.tsx` into domain-focused components/hooks with clear ownership boundaries.
    - Document and adopt a single styling direction for net-new/modified surfaces (e.g., CSS Modules or Tailwind).
    - Preserve existing user-facing behavior while reducing coupling.
  - Out of scope:
    - Full app-wide visual redesign.
    - Migrating every legacy component in one pass.
- **Dependencies (backend/migration)**:
  - Backend: None required.
  - Migration: None.
- **Definition of done**:
  - [x] `AppContent.tsx` complexity reduced via extracted modules and explicit interfaces.
  - [x] Chosen styling strategy documented and applied to touched files.
  - [x] Build/tests pass with no regressions in core gallery workflows (`npx tsc --noEmit` clean).
  - [x] TODO references updated with completion status.

## EIS-104 - Close local quality debt prior to backend expansion ✅ DONE (2026-04-01)

- **Source item**: "Close remaining local quality debt (`no-explicit-any`, `useImages`/`useStacks` closure and dependency issues)"
- **Suggested owner/team**: Electron Frontend Quality
- **Completed**: 2026-04-01
- **Changes made**:
  - `src/electron.d.ts` — Exported `DiagnosticsReport` and `ProcessMemorySnapshot`; `getDiagnostics` / `getProcessMemoryInfo` return types reference them.
  - `src/components/Diagnostics/DiagnosticsModal.tsx` — Typed diagnostic state; `catch (err: unknown)` with `instanceof Error` narrowing.
  - `src/components/Runs/RunsPage.tsx` — Use `job.input_path` on `BackendJobInfo` (removed `as any`); fixed unused destructuring binding in pipeline operations filter.
  - `src/services/apiClient.ts` — Use typed `window.electron` for `getApiPort` (no `as any`).
  - `src/hooks/useFolders.ts` — Initial load via `queueMicrotask` + stable `fetchFolders` (`useCallback`) to avoid synchronous `set-state-in-effect`; removed prior eslint-disable.
  - **Note:** `useImages` / `usePaginatedData` / `useStacks` already had no `any` and EIS-101 race hardening; full-repo ESLint still reports unrelated baseline issues (tests, other components).
- **Scope boundaries**:
  - In scope:
    - Eliminate remaining high-impact `no-explicit-any` warnings in active app code.
    - Resolve known closure/dependency hazards in `useImages` and `useStacks`.
    - Add/adjust lint rules or typed helpers where needed to prevent regressions.
  - Out of scope:
    - Whole-repo strict-mode migration.
    - Purely cosmetic lint cleanups unrelated to runtime safety.
- **Dependencies (backend/migration)**:
  - Backend: None required.
  - Migration: None.
- **Definition of done**:
  - [x] Targeted lint/type debt list for this item is fully closed (touched production files clean under ESLint; `npx tsc --noEmit` clean).
  - [x] Hook dependency/closure fixes are covered by tests or deterministic reproduction checks (`useFolders` mount path; existing `useImages` race tests unchanged).
  - [x] CI/local lint pipeline passes for touched scope.
  - [x] TODO references updated with completion status.

## EIS-105 - Execute embedding feature wave with backend coordination

- **Source item**: "Execute embedding feature wave with backend coordination (Tag Propagation → Outlier Detection → 2D Map → Smart Stack Representative)"
- **Suggested owner/team**: Cross-team (Electron Frontend + Python Backend/ML)
- **Scope boundaries**:
  - In scope:
    - Sequence and track four feature deliverables: Tag Propagation, Outlier Detection, 2D Map, Smart Stack Representative.
    - Define per-feature API contract expectations and rollout gating.
    - Implement Electron UI/integration only for backend-ready endpoints.
  - Out of scope:
    - Inventing production ML algorithms inside Electron.
    - Shipping features without agreed backend contract/versioning.
- **Dependencies (backend/migration)**:
  - Backend: Required for similarity/embedding endpoints and progress/event support.
  - Migration: Embedding data lives in PostgreSQL; coordinate with backend schema/API changes only.
- **Definition of done**:
  - Each of the four features has: implemented UI path, integrated backend calls/events, and user-facing acceptance criteria met.
  - Contract/version notes documented for cross-repo compatibility.
  - Feature flags or rollout notes are documented if partial release is needed.
  - TODO references updated with completion status.

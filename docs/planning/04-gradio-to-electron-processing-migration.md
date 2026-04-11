# Gradio → Electron Migration Plan: Processing Workspace

Last Updated: Mar 15, 2026.

## Objective

Migrate the current Gradio **Pipeline** experience into the Electron app as a first-class **Processing** workspace, preserving operator workflows (folder selection, phase controls, skip/retry, logs, queue visibility) while aligning with existing Electron patterns.

## Scope

### In scope
- Add a top-level navigation target for **Processing** (menu item + renderer route/view state).
- Reuse existing left folder tree/navigation where possible.
- Rebuild pipeline controls in React (Quick Start, Run All Pending, Stop, per-phase cards, options, skip/retry, actor/reason input).
- Show pipeline phases, steps, statuses, progress counters, queue state, and worker logs.
- Connect UI actions to existing API/IPC (`submitPipeline`, phase skip/retry, status endpoints, WebSocket job events).
- Provide feature-flagged rollout so gallery workflows remain stable during migration.

### Out of scope (first cut)
- Full redesign of pipeline semantics on backend.
- New ML/scoring logic.
- Replacing all existing gallery screens.

## Current-state observations (Electron)

- Electron already exposes pipeline submission and job APIs via preload IPC wrappers.
- Electron main process already manages application menu and can dispatch view-open events (e.g., settings/duplicates) to renderer.
- Renderer already has folder tree, app-wide layout, notification system, and WebSocket subscription for `job_started`, `job_progress`, and `job_completed`.

This means migration is primarily a **UI/flow orchestration** effort rather than low-level transport work.

## Target UX

1. User opens **Processing** from the Electron menu.
2. Left panel shows existing folder tree; selecting a folder binds the right panel state.
3. Right panel presents:
   - Quick Start strip (select folder → run pending → review results).
   - End-to-end phase progress row (Discovery → Inspection → Quality Analysis → Similarity Clustering → Tagging; see backend [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md)).
   - Batch controls (Run All Pending / Stop All).
   - Operator metadata fields (skip reason, actor).
   - Per-phase cards with progress, state, run/skip/retry actions, and options.
   - Queue + worker log panel with streaming updates and status badges.
4. Completion/failure updates are reflected in real time and surfaced in notifications.

## Delivery plan

### Phase 0 — Discovery + Contract Lock (1–2 days)
- Verify all backend endpoints needed for:
  - folder-level aggregate progress;
  - per-phase status/progress;
  - phase skip/retry actions;
  - active queue and textual logs.
- Define a normalized frontend model (`ProcessingFolderState`, `ProcessingPhaseState`, `WorkerLogEntry`) and fallback defaults for missing fields.
- Confirm event taxonomy from WebSocket stream and map it to store mutations.

### Exit criteria
- Finalized JSON contract notes in spec.
- No unknown required API field for UI rendering.

### Phase 1 — Navigation Skeleton + Menu Integration (1 day)
- Add **Processing** entry in Electron application menu.
- Emit renderer event (e.g., `open-processing`) from main process click handler.
- Extend preload bridge/types for the new event subscription helper.
- Add `currentView` variant in renderer (`gallery | duplicates | processing`).
- Render placeholder Processing screen using existing `MainLayout` composition.

### Exit criteria
- Menu click deterministically switches to Processing workspace.
- Existing menu actions remain unaffected.

### Phase 2 — Processing Workspace MVP (3–4 days)
- Build Processing page structure:
  - left: reusable folder tree;
  - right: quick-start + global controls + phase cards + console/log panel.
- Add a dedicated state store/hook for processing status and log buffer.
- Wire actions to API/IPC:
  - run all pending;
  - stop current job;
  - run single phase;
  - skip/retry phase.
- Wire WebSocket events to optimistic/progressive UI updates.

### Exit criteria
- Operator can fully process selected folder from Electron without Gradio.
- Live statuses/logs refresh without manual reload.

### Phase 3 — UX Hardening + Reliability (2–3 days)
- Add loading/empty/error/sync-loss states.
- Add action disabling rules for invalid states (e.g., skip while phase not eligible).
- Add log virtualization/trim policy to avoid renderer slowdown.
- Persist panel preferences (expanded options/log panel) per user session.
- Add keyboard navigation and focus order for operational efficiency.

### Exit criteria
- Smooth performance on large folders and long-running jobs.
- Clear recoverability when API/WebSocket disconnects.

### Phase 4 — Cutover + Decommission (1–2 days)
- Add feature flag default ON for internal users.
- Validate parity checklist against Gradio workflow.
- Update docs and operator runbook to point to Electron Processing.
- Decide whether to archive or leave Gradio Pipeline as fallback for one release.

### Exit criteria
- Team confirms Electron Processing is primary operator UI.

## Work breakdown by layer

### Main process (`electron/main.ts`)
- Add **Processing** menu item under `Tools` (or dedicated top-level `Processing` menu) with `webContents.send('open-processing')`.
- Preserve current menu rebuild behavior and role menus.

### Preload bridge (`electron/preload.ts` + exposed types)
- Add `onOpenProcessing(callback)` event helper.
- Ensure Processing API methods are exposed for all required phase controls/status endpoints.

### Renderer app shell (`src/AppContent.tsx`)
- Extend `currentView` union to include `processing`.
- Register and clean up new `onOpenProcessing` listener.
- Add view switch UI state restoration (last selected folder and view).

### New renderer domain (`src/components/Processing/*`, `src/store/*`)
- `ProcessingPage` container.
- `ProcessingPhaseCard` component (status + controls + options).
- `ProcessingTimeline` component for index/meta/scoring/culling/keywords.
- `ProcessingConsole` for log stream.
- Zustand store or domain hook for processing state machine.

## Data contract snapshot (proposed)

```ts
type PhaseKey = 'index' | 'meta' | 'scoring' | 'culling' | 'keywords';

type ProcessingPhaseState = {
  phase: PhaseKey;
  status: 'not_started' | 'queued' | 'running' | 'done' | 'skipped' | 'failed';
  processed: number;
  total: number;
  startedAt?: string;
  endedAt?: string;
  message?: string;
  canRun: boolean;
  canSkip: boolean;
  canRetry: boolean;
};

type ProcessingFolderState = {
  folderPath: string;
  imageCount: number;
  overallStatus: 'idle' | 'running' | 'completed' | 'failed';
  phases: ProcessingPhaseState[];
  queueDepth: number;
  activeWorker?: string;
};

type WorkerLogEntry = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  source: 'pipeline' | 'worker' | 'api' | 'system';
  message: string;
};
```

## Acceptance criteria

- Processing can be opened from Electron menu via **Processing** item.
- Left folder tree remains available and drives context for all processing actions.
- UI surfaces:
  - phase-level statuses and counters;
  - run/stop/skip/retry controls;
  - queue and worker log updates;
  - operator metadata (actor + reason).
- Real-time events reconcile correctly with current screen state.
- No regression in Gallery and Duplicate Finder flows.

## Risks & mitigations

- **Risk:** Event ordering races (progress after completion).
  - **Mitigation:** Sequence numbers/timestamps and reducer guards.
- **Risk:** Log volume degrades render performance.
  - **Mitigation:** bounded ring buffer + virtualized list.
- **Risk:** API schema drift from Gradio assumptions.
  - **Mitigation:** typed adapter layer and runtime validation.
- **Risk:** User confusion during transition.
  - **Mitigation:** in-app banner “Processing moved to Electron” + fallback toggle for one release.

## Test strategy

- Unit:
  - Processing reducer/store transitions from synthetic event streams.
  - Phase card action enable/disable matrix.
- Integration (renderer):
  - menu event opens Processing view;
  - folder selection updates phase panel;
  - action buttons dispatch correct IPC payloads.
- E2E smoke:
  - select folder → run all pending → observe progress and completion;
  - induce failed phase and verify retry/skip behavior.

## Implementation checklist

- [ ] Add menu event plumbing (`open-processing`) main ↔ preload ↔ renderer.
- [ ] Add Processing view route/state in app shell.
- [ ] Build Processing page with folder tree reuse.
- [ ] Implement phase timeline + cards + global controls.
- [ ] Implement worker log panel with buffering/virtualization.
- [ ] Connect API/WS adapters and optimistic updates.
- [ ] Add tests for state transitions and menu navigation.
- [ ] Final parity validation against Gradio Pipeline.

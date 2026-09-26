---
type: Report
title: Gallery improvement audit (September 2026)
description: Clean-room product, UX, accessibility, security, reliability, and maintainability audit of the Driftara Gallery desktop application.
resource: docs/reports/10-gallery-improvement-audit-2026-09.md
tags: [gallery-docs, reports, audit, clean-room, ux, security, quality]
timestamp: 2026-09-25T02:00:00Z
okf_version: 0.1
---

# Gallery improvement audit (September 2026)

This report records a point-in-time review of the Electron, React, and TypeScript gallery on 2026-09-24. It suggests improvements; it does not add commitments to the product backlog. Convert accepted items into issues through the [backlog workflow](../project/00-backlog-workflow.md) and keep API or pipeline changes with the owning backend repository.

## Clean-room provenance

> Provenance: derived from competitive analysis of a commercial application's observable behaviour and documentation; contains no code, identifiers, fitted constants or model artefacts from it.

The engineering audit was produced independently from the gallery's first-party materials:

- the source, tests, configuration, and documentation in this repository;
- local output from the repository's documented typecheck, lint, doctor, design, and test commands; and
- screenshots already committed to this repository's documentation.

Competitive input is represented only as implementation-independent behaviour. This report contains no proprietary binaries, recovered or minified source, internal identifiers, assets, model files, scoring formulas, fitted constants, private implementation details, copied UI text, or copied layouts. The code-level, security, accessibility, and maintainability findings come from this clean-room repository itself. Any implementation should continue to use only repository-owned code, public standards, documented public APIs, open upstream models under their own licences, and independently developed behaviour.

## Executive assessment

The application has a strong base: Electron isolation is enabled, renderer access is mediated by preload/IPC, the gallery is virtualized, expensive RAW preview work is bounded, database and API modes are explicit, and the documentation identifies ownership across repositories. The highest-return work is to strengthen a few trust boundaries, restore a clean lint baseline, make Windows test runs observable, and give photographers a faster inspection workspace.

The recommended order is:

1. constrain local-file delivery and harden navigation/external-link handling;
2. resolve React hook and stale-dependency lint errors before they become intermittent UI defects;
3. make the full test command finish predictably and report progress on Windows;
4. align the Node.js prerequisite with the Vite toolchain;
5. build a small compare/inspection slice using data the gallery already owns; and
6. reduce risk in the largest modules while consolidating modal accessibility and visual styling.

## Scope and method

The review covered the Electron main process, preload bridge, renderer, IPC registrations, data access, tests, build configuration, current planning and design documents, and repository health commands. It was a static and local dynamic review, not a penetration test, usability study, or production performance benchmark.

At the time of review, the application contained approximately 46,500 lines across 168 production TypeScript/TSX files. The largest relevant hand-maintained modules included `electron/db.ts` (2,644 lines), `src/components/Viewer/ImageViewer.tsx` (1,776), `electron/ipc/registerBackupHandlers.ts` (1,132), `src/AppContent.tsx` (967), and `src/components/Backup/BackupModal.tsx` (776). Generated API code was excluded from refactoring recommendations.

## What is already working well

- Browser windows use `contextIsolation: true`, `nodeIntegration: false`, and `webSecurity: true`.
- The preload/bridge architecture creates a recognizable process boundary instead of exposing Node.js directly to the renderer.
- The grid uses virtualization and bounds the loaded result set; RAW preview generation also has concurrency and cache controls.
- Database, API, sync, backup, diagnostics, and culling workflows have meaningful automated coverage spread across 79 discovered test files.
- `npm run doctor`, both TypeScript checks, and `npm run design:check` passed during this review.
- `ConfirmDialog` already demonstrates useful dialog semantics and focus management that can become a shared primitive.
- Repository documentation clearly assigns API contracts, schema, and pipeline terminology to the backend.

## Prioritized findings

| Priority | Finding and evidence | Impact | Recommendation and acceptance criteria |
|---|---|---|---|
| P0 | The `media://` protocol accepts normalized absolute paths and is registered with `bypassCSP: true`. Normalization does not establish authorization. | If renderer content is compromised, the protocol may expose local files beyond approved libraries, thumbnails, or exports. | Issue opaque media tokens or validate canonical paths against explicit approved roots, including symlink/junction behavior. Remove `bypassCSP` unless a documented test proves it is required. Tests must reject arbitrary absolute paths, traversal forms, alternate separators, URLs, junction escapes, and paths outside every approved root. |
| P0 | No explicit `setWindowOpenHandler` or `will-navigate` policy was found, while a system handler can open external URLs. | Unexpected navigation or unvalidated schemes can cross the renderer/OS boundary. | Deny new windows by default, prevent top-level navigation away from the packaged/dev origin, and allow only intentional external schemes and hosts. Add table-driven tests for `https`, `http`, `file`, custom schemes, credentials, encoded hosts, and malformed URLs. |
| P0 | `npm run lint` completed with 16 errors and 13 warnings, including synchronous state changes in effects, hook-rule violations, stale/missing dependencies, and React Compiler memoization conflicts. | These are correctness and lifecycle risks, especially in `AppContent`, `ImageViewer`, `SyncModal`, `useDatabase`, and `useGalleryWebSocket`. A noisy baseline also hides new regressions. | Fix the behavioral issues rather than suppressing rules. Reach zero lint errors, explicitly triage every warning, and keep lint required in CI. Add focused tests only where the fix changes observable behavior or closes a race. |
| P1 | The full Vitest command did not finish or print case-level progress during a roughly four-minute observation window and had to be interrupted. File discovery eventually found 79 test files. Windows GLib/GIO AppRuntime warnings were also printed. | Developers cannot quickly distinguish a slow suite, leaked handle, stalled test, or reporter problem. This reduces confidence in pre-merge validation. | Add a diagnostic test script with verbose progress, per-file timing, a bounded timeout, and open-handle/pool investigation. Identify the slow or non-terminating worker and document the expected local duration. Acceptance: two consecutive Windows runs terminate with a stable summary and useful failure location. |
| P1 | The README and doctor accept Node 18+, but installed Vite 7.3.1 declares `^20.19.0 || >=22.12.0`. | A setup can pass doctor and still be unsupported by the build tool. | Set `package.json#engines.node`, README prerequisites, doctor validation, and CI versions to one supported range. Add a doctor test around the minimum version. |
| P1 | Several large modals do not show consistent dialog semantics, focus trapping/restoration, or a shared Escape/scroll-lock contract. `ConfirmDialog` already contains a stronger implementation. | Keyboard and assistive-technology users can lose context or interact with background UI. Every custom modal duplicates subtle behavior. | Extract or adopt a shared dialog primitive based on the good behavior in `ConfirmDialog`. Migrate Import, Sync, Settings, Diagnostics, Backup, and viewer overlays. Verify labelled dialog semantics, initial focus, Tab loop, Escape policy, restored focus, and background inertness. |
| P1 | Main-process and data-layer code emits many direct console messages, including paths and SQL-related context. | Production diagnostics can expose sensitive library structure and generate noisy reports, while ad hoc logs are hard to filter. | Use a structured logger with levels and field redaction. Default production logs to concise events; gate SQL/debug detail; redact or hash personal paths and identifiers; impose retention/size limits; and make the diagnostics export disclose what it includes. |
| P2 | Several core modules combine state, orchestration, rendering, and platform concerns. | Changes become difficult to review and lifecycle defects cluster in the same files now flagged by lint. | Decompose by stable domain seams: viewer session/navigation/zoom/actions; database query domains; backup planning/execution/reporting; and thin preload/renderer adapters. Preserve public behavior and land small slices with existing integration tests. Do not split generated files merely to reduce line counts. |
| P2 | At least 25 TSX files use inline style objects and 34 TSX/CSS files contain direct hex values. The design check passes, but older high-change surfaces such as Backup and Viewer still carry migration debt. | Theme consistency, state styling, and review of accessibility states become harder as these screens evolve. | When a surface changes materially, move its visual rules to CSS Modules and shared tokens under the existing UX constitution. Extend `design:check` only for rules that can be enforced with low false-positive rates. |
| P2 | The application has good virtualization and bounded preview work, but no documented repeatable performance budget for large libraries. | Regressions can land without a shared definition of acceptable first-grid, navigation, memory, and reconnect behavior. | Add deterministic 10k and 100k metadata fixtures and measure first useful grid, scroll responsiveness, heap plateau, detail-open latency, and backend reconnect. Record machine assumptions and compare trends in scheduled CI or a reproducible local harness. |

## Complete lint inventory

The lint result is recorded by file so later work can be split without rerunning this audit. Counts below total the reported 16 errors and 13 warnings.

| File | Severity/count | Rule and observed concern |
|---|---:|---|
| `electron/backupSpace.test.ts` | 1 error | Unused `droppedRelPaths` test variable (`@typescript-eslint/no-unused-vars`). |
| `electron/ipc/registerBackupHandlers.ts` | 1 error | `finalPlan` is never reassigned (`prefer-const`). |
| `electron/main.ts` | 1 error | Unused `isSingleImageViewOpen` assignment (`@typescript-eslint/no-unused-vars`). |
| `src/App.tsx` | 1 error | Synchronous state update inside an effect (`react-hooks/set-state-in-effect`). |
| `src/AppContent.tsx` | 5 errors, 2 warnings | Two synchronous effect updates; three React Compiler/manual-memoization dependency mismatches; missing callback/setter dependencies in an effect and breadcrumb memo. |
| `src/bridge.ts` | 1 error | `useFolderModeStubs` is invoked from a non-hook `get` function (`react-hooks/rules-of-hooks`). |
| `src/components/Import/ImportModal.tsx` | 1 warning | Effect omits `completeOp`, `startOp`, and `updateOp`. |
| `src/components/Shared/BirdBoxOverlay.tsx` | 1 error | Non-component export conflicts with Fast Refresh (`react-refresh/only-export-components`). |
| `src/components/Sidebar/CalendarPicker.tsx` | 1 error | Effect calls `fetchDates`, which synchronously updates state (`react-hooks/set-state-in-effect`). |
| `src/components/Sync/SyncModal.tsx` | 1 error, 1 warning | Callback memoization omits `preview?.candidates`, causing both compiler and exhaustive-dependency findings. |
| `src/components/Viewer/ImageViewer.tsx` | 4 warnings | Two unnecessary `bridge` dependencies and two missing `readOnlyFilesystemMode` dependencies. |
| `src/components/Viewer/SimilarSearchDrawer.tsx` | 2 warnings | Memo arrays contain values that do not determine the memoized results. |
| `src/context/AppModeContext.tsx` | 1 error | Non-component export conflicts with Fast Refresh. |
| `src/hooks/useDatabase.ts` | 1 error, 2 warnings | Callback memoization depends on a property where the compiler infers `result`; `propagate` is recreated and destabilizes a memo. |
| `src/hooks/useGalleryWebSocket.ts` | 1 warning | Effect omits five refresh refs from its dependency array. |
| `src/utils/logMessageLinks.tsx` | 1 error | Non-component export conflicts with Fast Refresh. |

The hook-related entries deserve behavioral review before mechanical edits. Adding dependencies can trigger refetch or reconnection loops, while removing memoization can change identity-sensitive consumers. The three unused/export-layout findings are suitable early cleanup once their test impact is confirmed.

## Product improvement opportunities

### 1. Inspection workspace

The most valuable product addition is a compact workspace for choosing among similar frames. Start with a narrow, independently designed slice:

- compare two to four selected images;
- synchronize pan and zoom, with a quick 100% loupe;
- expose histogram and clipping indicators calculated from displayed pixels;
- retain keyboard actions for rating, label, pick/reject, and next/previous; and
- show only score and diagnostic fields already present in documented contracts.

This extends the current viewer and stack workflows without inventing backend fields or moving scoring into the renderer. The existing clean-room [burst culling explainability plan](../features/planned/burst-culling-explainability.md) contains additional first-party requirements for evidence and comparison. Treat those as later slices gated by the backend contract, rather than blocking the basic compare experience.

Acceptance signals: median time to choose a frame in a stack, actions per selection, compare abandonment rate, and undo/reversal rate.

### 2. Saved views and visible filter state

Turn the current persisted browser state into named, explicit workspaces. Users should be able to save filters, sort order, grouping, and display density; see active filters as removable chips; reopen the last workspace; and reset to a known default. Store only gallery-owned query state and version the persisted schema so upgrades can migrate or discard stale state safely.

Acceptance signals: percentage of sessions using a saved view, time from launch to first useful selection, and reduced filter-reset actions.

### 3. Setup and degraded-mode assistant

When startup cannot reach the selected data source, replace generic retry loops with a status panel showing the chosen mode, backend/database reachability, library root availability, thumbnail health, and the next safe action. Offer **Run diagnostics** and **Copy report** with path redaction. Keep configuration authority in the existing settings and doctor contracts.

Acceptance signals: setup completion rate, recovery without log inspection, and support reports containing the required diagnostic fields.

### 4. Safer culling and deletion review

Strengthen confidence around destructive workflows with a review manifest, explicit counts and estimated bytes, and an undo window before final commitment. Where the platform contract permits it, prefer sending files to the OS recycle facility over immediate permanent deletion. Keep every decision reversible until the final confirmation and ensure the grid reconciles success, partial failure, and cancellation.

Acceptance signals: destructive-action cancellation rate, restoration requests, partial-failure recovery, and mismatches between UI state and disk state.

### 5. Backup confidence center

The current backup feature already exposes substantial preflight and fleet information. Consolidate it into a simpler readiness view: destination identity, available capacity, estimated transfer, coverage mode, last completed backup, last verification, and a guided restore check. The goal is to make “Can I safely clear this card?” answerable at a glance, while retaining detailed diagnostics on demand.

Acceptance signals: successful preflight rate, verification coverage, restore-check completion, and fewer retries caused by destination/configuration mistakes.

### 6. Command discovery

Add a searchable command palette and shortcut overlay generated from the same command registry as menus and handlers. Show shortcuts near relevant controls and allow users to discover commands without leaving the current photo. Keep unavailable actions visible with a reason when that improves learnability.

Acceptance signals: keyboard-action adoption, command search success, and reduced repeated pointer travel in rating/culling sessions.

## Engineering sequence

### First 0–2 days

1. File narrowly scoped issues for the two trust-boundary findings and the lint groups; do not place speculative work directly into `TODO.md`.
2. Align the Node version contract across package metadata, README, doctor, and CI.
3. Add a verbose, bounded Vitest diagnostic command and capture which file or worker prevents normal completion.
4. Define approved media roots and URL policy in a short threat model before changing protocol behavior.

### Next 1–2 sprints

1. Ship media-path authorization, navigation/window-open denial, and external URL validation with boundary tests.
2. Return lint to a clean baseline, prioritizing hook dependencies and lifecycle behavior.
3. Extract a shared accessible dialog and migrate the highest-traffic modal first.
4. Introduce structured, redacted main-process logging and a bounded diagnostic export.
5. Prototype the two-image inspection workspace behind an internal flag using current contracts only.

### Following 1–2 quarters

1. Expand inspection to synchronized multi-image review, then add evidence fields only after backend contracts land.
2. Add saved views and a setup/degraded-mode assistant informed by real support cases.
3. Decompose Viewer, database, and backup domains as feature work touches them.
4. Establish large-library performance fixtures and trend budgets.
5. Consolidate backup confidence and reversible culling workflows after testing them with representative libraries and devices.

## Suggested delivery matrix

| Candidate | User value | Risk reduction | Effort | Suggested order |
|---|---:|---:|---:|---:|
| Media/navigation boundary hardening | Medium | Very high | Medium | 1 |
| Hook/lint correctness baseline | Medium | High | Medium | 2 |
| Test termination and progress | Indirect | High | Small–medium | 3 |
| Node prerequisite alignment | Indirect | Medium | Small | 4 |
| Shared accessible dialog | High | High | Medium | 5 |
| Two-image inspection slice | Very high | Low | Medium | 6 |
| Structured/redacted logging | Medium | High | Medium | 7 |
| Saved views/filter chips | High | Low | Medium | 8 |
| Large-library performance budgets | Medium | Medium | Medium | 9 |
| Major module decomposition | Indirect | Medium | Large, incremental | As touched |

## Guardrails for implementation

- Keep filesystem, database, process, and shell capabilities behind validated IPC/preload contracts.
- Keep model execution and scoring in the owning backend; the gallery should present documented results and user controls.
- Do not invent fields that are absent from the OpenAPI or database authority.
- Validate paths after canonicalization and authorize them against explicit roots; string normalization alone is insufficient.
- Preserve read-only behavior in API mode and define offline/degraded behavior explicitly.
- Keep destructive operations transactional where possible and visibly reconcile partial failures.
- Continue the clean-room boundary stated above for all product and implementation work.

## Validation snapshot

Commands were run from a clean `main` working tree on Windows with Node.js 22.20.0.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npx tsc -p electron/tsconfig.json --noEmit` | Passed |
| `npm run doctor` | Passed; reported configuration and sibling-backend lock healthy |
| `npm run design:check` | Passed |
| `npm run lint` | Completed with 16 errors and 13 warnings |
| `npx vitest list --filesOnly` | Discovered 79 test files; process/reporting behavior was slow enough to require investigation |
| `npm run test:run` | No final result within the observation window; interrupted after roughly four minutes, so this audit does not claim a test pass or failure |

## Related documentation

- [Documentation index](../README.md)
- [Reports index](README.md)
- [UX/UI constitution](../design/UX_UI_CONSTITUTION.md)
- [Frontend UX specification](../design/FRONTEND_UX_SPEC.md)
- [System overview](../architecture/01-system-overview.md)
- [Development guide](../DEVELOPMENT.md)
- [Testing and coverage](../guides/03-testing-and-coverage.md)
- [Codebase refactor plan](../planning/CODEBASE_SIZE_REFACTOR_PLAN.md)
- [Backlog workflow](../project/00-backlog-workflow.md)

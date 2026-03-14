# High-Impact Next Steps - Tracked Tasks

Source: `TODO.md` → **Highest-Impact Next Steps (Recommended Sequence)**.

These tracked tasks are the auditable execution records for the five highest-impact items and include explicit boundaries, cross-repo dependencies, definition of done, and ownership suggestions.

## EIS-101 - Harden `useImages` data-loading race safety

- **Source item**: "Harden data-loading race safety in `useImages` (request token / in-flight guard)"
- **Suggested owner/team**: Electron Frontend (Gallery/Hooks)
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
  - Reproduction scenario for duplicate pagination/stale overwrite is no longer reproducible.
  - Existing hook behavior remains unchanged for normal load path.
  - Tests cover at least one stale-response and one concurrent-request scenario.
  - TODO references updated with completion status.

## EIS-102 - Stabilize runtime observability

- **Source item**: "Stabilize runtime observability (log rotation/retention + bounded WebSocket reconnect policy)"
- **Suggested owner/team**: Electron Platform + Runtime
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
  - Long-running session log growth is bounded by policy.
  - WebSocket reconnect attempts are bounded and observable in logs.
  - Manual failure test demonstrates backoff/jitter and clean terminal state after max retries.
  - TODO references updated with completion status.

## EIS-103 - Decompose `AppContent.tsx` + styling strategy alignment

- **Source item**: "Decompose `AppContent.tsx` and align styling strategy"
- **Suggested owner/team**: Electron Frontend Architecture
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
  - `AppContent.tsx` complexity reduced via extracted modules and explicit interfaces.
  - Chosen styling strategy documented and applied to touched files.
  - Build/tests pass with no regressions in core gallery workflows.
  - TODO references updated with completion status.

## EIS-104 - Close local quality debt prior to backend expansion

- **Source item**: "Close remaining local quality debt (`no-explicit-any`, `useImages`/`useStacks` closure and dependency issues)"
- **Suggested owner/team**: Electron Frontend Quality
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
  - Targeted lint/type debt list for this item is fully closed.
  - Hook dependency/closure fixes are covered by tests or deterministic reproduction checks.
  - CI/local lint pipeline passes for touched scope.
  - TODO references updated with completion status.

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
  - Migration: Potentially impacted by Firebird→Postgres milestones if embedding data paths change.
- **Definition of done**:
  - Each of the four features has: implemented UI path, integrated backend calls/events, and user-facing acceptance criteria met.
  - Contract/version notes documented for cross-repo compatibility.
  - Feature flags or rollout notes are documented if partial release is needed.
  - TODO references updated with completion status.

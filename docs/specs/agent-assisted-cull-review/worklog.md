---
type: "Log"
title: "Agent-assisted cull review — gallery worklog"
description: "Gallery/Electron side of the agent-assisted cull review feature. Backend spec & worklog:"
resource: "docs/specs/agent-assisted-cull-review/worklog.md"
tags: ["agent-assisted-cull-review", "gallery-docs", "specs"]
timestamp: 2026-06-16T00:00:00Z
---

# Agent-assisted cull review — gallery worklog

Gallery/Electron side of the agent-assisted cull review feature. Backend spec & worklog:
`image-scoring-backend/docs/specs/agent-assisted-cull-review/`. Epic: gallery #134
(backend #253). Metadata-only — no physical delete/trash in any phase.

---

## 2026-06-13 — Gallery MVP: panel base + #135 / #136 / #137

**Branch:** `feat/agent-cull-gallery-mvp` · **PR:** #139

### Starting state
The read-only + action `AgentCullReviewPanel`, full IPC bridge, and types were
already present as **uncommitted** changes on `main` (produced in a prior Cursor
session), tangled with an unrelated batch of bug fixes. Type-check (renderer +
electron) was clean.

### Work done

1. **Branch + split commits** (`feat/agent-cull-gallery-mvp`)
   - `623b922` feat(culling): agent-cull panel base + IPC bridge + types + AppContent wiring (#134)
   - `9d3f63b` fix(gallery): unrelated batch — CalendarPicker TZ, GalleryGrid member chips,
     StackAnalyticsBanner decision-count chips, bridge health-check GET, db `birds:species-exhausted`
     filter, docs (kept separate from the agent-cull work).
   - `0892d8a` lint follow-up: drop now-unused `activeSubStackId` dep from GalleryGrid `itemContent`.

2. **#135 — Run dry-run review from UI** (`717d112`)
   - "Run dry-run review" button → `runAgentCullReview({ stackId, subStackId, dryRun: true })`.
   - Panel now renders even with **no existing review** so an operator can discover + run for the
     current stack/substack; dry-run badge shows after refresh. No delete/trash.
   - Vitest: button → IPC.

3. **#136 — stale_group_state / 409 UX** (`717d112`)
   - `friendlyAgentError()` maps backend codes to operator messages, handling **both** thrown
     HTTP 409 errors (`stale_group_state` embedded in apiService error message → IPC envelope →
     `unwrapEnvelope` throw) **and** `{ ok: false, error }` action results returned with HTTP 200
     (`dry_run_group`, `agent_review_disabled`). Prompts a re-run instead of a generic failure.
   - Vitest: 409 stale path + `ok:false` dry_run_group path.

4. **#137 — OpenAPI + types sync** (`760df13`)
   - `npm run contract:update` re-synced `api-contract/openapi.json` from the live backend
     (**57 endpoints added, 0 removed** — snapshot was stale; includes all 9 `/api/culling/agent-review/*` routes).
   - Regenerated `electron/api.generated.ts` from the in-repo snapshot via `npx openapi-typescript`
     (kept self-contained — see caveat below).
   - `npm run contract:check` ✅.

### Verification
- `npx tsc --noEmit` ✅ · `npx tsc -p electron/tsconfig.json --noEmit` ✅
- `npm run contract:check` ✅
- Vitest: AgentCullReviewPanel 6/6; CullingAnalytics + GalleryGrid + db.getKeywordCloud 19/19 ✅
- Lint: changed agent-cull files clean. Remaining repo lint errors are **pre-existing** and
  out of scope (apiClient.test, exportImageBake.test, nefViewer.test, logMessageLinks, bridge,
  CalendarPicker/GalleryGrid effect-setState — untouched lines).

### Board
- #135, #136, #137 → Stage = **Review** (project #1).
- PR #139 references `Closes #135 / #136 / #137` (auto-closes + Status=Done on merge).

### Caveats / follow-ups
- **Tooling source mismatch (cross-repo):** `npm run generate:api-types` reads the *sibling*
  `../image-scoring-backend/openapi.json`, which is **stale** (predates agent-review). For the
  canonical flow to match, the **backend must regenerate its committed `openapi.json`**
  (backend cross-repo #137 / AGENT_COORDINATION). This PR generated types from the in-repo
  snapshot to stay self-contained.
- **Feature gating:** the Run button is shown whenever the `runAgentCullReview` IPC exists; if the
  backend feature is disabled it returns `agent_review_disabled`, surfaced via #136. No dedicated
  renderer "enabled" flag yet.
- Not in scope (future): real CLI provider runs, Postgres integration tests, physical
  deletion/trash workflow, export/global-filter semantics for `candidate_status`.

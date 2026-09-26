---
type: "Plan"
title: "Evidence-led review workflow improvement candidates"
description: "Clean-room product and engineering ideas for faster, safer, and more explainable photo review in Driftara Gallery."
resource: "docs/planning/reference-workflow-improvement-candidates.md"
tags: ["gallery-docs", "planning", "culling", "evidence", "review", "clean-room"]
timestamp: 2026-09-25T18:00:00Z
okf_version: 0.1
status: "proposed"
---

# Evidence-led review workflow improvement candidates

> **Status:** proposal inventory, not a backlog commitment. Accepted slices should enter the project board through the [backlog workflow](../project/00-backlog-workflow.md).

## Provenance and clean-room boundary

> derived from competitive analysis of a commercial application's observable behaviour and documentation; contains no code, identifiers, fitted constants or model artefacts from it.

This page specifies user-visible outcomes and clean-room engineering practices. It contains no copied layouts, text, algorithms, private assets, recovered constants, or model dependencies. Any numeric value selected during product work is a starting point to be re-fitted or usability-tested with project-owned data.

## Relationship to existing work

This proposal complements:

- [Burst culling explainability](../features/planned/burst-culling-explainability.md), the detailed evidence UI proposal;
- [Gallery improvement audit](../reports/10-gallery-improvement-audit-2026-09.md), the broader security, quality, and product audit;
- [UX/UI constitution](../design/UX_UI_CONSTITUTION.md); and
- the backend's [subject-aware evidence plan](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/subject-aware-culling-evidence.md).

The ideas below focus on workflow coherence and safe behaviour once backend evidence becomes available.

## Recommended improvements

### 1. Create an inspection workspace, not another modal

Selected frames should open in a persistent workspace that preserves the active folder, stack, filters, and selection. It should support a small comparison set, synchronized pan/zoom, a quick native-pixel loupe, and keyboard navigation without discarding review state.

The exact comparison limit is a product-owned starting point to usability-test. The UI should degrade gracefully when full-resolution renditions are still loading.

**Acceptance evidence:** users can enter compare, inspect detail, flag a frame, return to the grid, and retain their place and selection.

### 2. Reveal evidence progressively

Use three layers:

1. compact result: representative, close-call badge, overall band, and processing state;
2. criterion layer: named bands, confidence/applicability, and short reasons; and
3. diagnostic layer: subject/head region, focus/noise overlays, model/rendition provenance, and raw values.

Unknown, not applicable, degraded, and failed must look different. Never render missing evidence as an average score. Colour always pairs with text and icon.

### 3. Add a non-destructive score sandbox

Users should be able to adjust criterion importance and a few understandable preferences without rerunning inference. The gallery sends or applies a versioned policy over stored evidence, labels the view as adjusted, and offers reset/compare-to-default.

Keep automatic measurements immutable. Saving a personal view should not overwrite canonical scores or other users' review state.

### 4. Make close calls first-class

When the backend cannot justify a single winner, show a close-call set rather than false precision. Offer a focused review queue that places the closest alternatives side by side and records the human choice as a separate decision.

The close-call rule comes from backend-calibrated uncertainty. The gallery must not invent a score-gap threshold.

### 5. Explain grouping and preserve manual edits

Show why a boundary exists using safe reason labels such as capture gap, visual change, camera change, or manual boundary. Support merge, split, detach, and pin through backend-owned APIs where possible.

After rescoring or regrouping, replay edits against stable identifiers. If an edit cannot be mapped safely, show a conflict instead of silently moving frames.

### 6. Add an evidence-aware degraded mode

A photo can be viewable even when evidence is incomplete. The inspector should show which stages are ready, queued, unavailable, degraded, or failed and provide the appropriate next action: retry, run missing phase, open diagnostics, or continue manual review.

Ranking controls should warn when required evidence is missing. Failed frames should remain visible but should not silently become recommended representatives.

### 7. Make destructive review reversible

Build deletion and move workflows around a manifest:

- exact photo and paired-file count;
- destination or recycle action;
- expected bytes;
- backup/verification state when available;
- per-file result; and
- an undo window or restore instructions.

Keep decisions reversible until the final confirmation. Reconcile the grid after success, cancellation, and partial failure.

### 8. Turn diagnostics into a support artifact

Provide a per-photo and per-stack bundle that can be copied or exported with path redaction. It should include evidence status/confidence, selected region, reason codes, policy/model/rendition revisions, cache provenance, and timings.

The gallery should render overlays from the same persisted evidence included in the bundle so screenshots and JSON cannot disagree.

### 9. Add saved review views

Allow named views for filter, sort, stack mode, display density, evidence visibility, and optional adjusted policy. Version the persisted view schema. If a view references unavailable fields, mark those filters unresolved rather than broadening the query silently.

Useful starter views could include close calls, processing errors, unreviewed representatives, low-confidence subjects, and manual-decision conflicts. These names are gallery-owned product vocabulary.

### 10. Improve command discovery and accessibility

Generate menus, command palette, shortcut help, and button tooltips from one command registry. Every command exposes availability and a reason when disabled.

The inspection workspace and dialogs need labelled semantics, predictable initial focus, trapped modal focus, restored focus, Escape policy, screen-reader announcements for asynchronous state, and full keyboard parity with pointer actions.

### 11. Budget large-library performance

Track first useful grid, scroll responsiveness, memory plateau, detail-open latency, cache growth, reconnect time, and cancellation latency on deterministic large-library fixtures. Load high-detail evidence only when requested or likely to be inspected.

Do not prefetch from an unbounded selection. Prioritize the active frame, visible alternatives, and the next navigation target.

### 12. Keep the renderer capability-light

All filesystem, database, process, shell, model, and destructive operations stay behind validated preload/API contracts. Media access uses opaque handles or canonical allow-listed paths. External links and navigation use explicit policies.

The gallery consumes backend evidence contracts and shared UI vocabulary; it does not reproduce scoring or model inference.

## Suggested delivery slices

| Order | Gallery slice | Dependency |
|---:|---|---|
| 1 | Explicit evidence states and degraded rendering | Additive backend contract |
| 2 | Persistent inspection workspace with basic compare | Current image/rating fields |
| 3 | Close-call review queue | Backend close-call/uncertainty output |
| 4 | Criterion/reason layer and diagnostic export | Versioned evidence envelope |
| 5 | Non-destructive score sandbox | Recomputable ranking policy contract |
| 6 | Durable burst editing and conflict UI | Backend edit/fingerprint contract |
| 7 | Saved review views and command registry | Stable workspace state schema |

Order numbers are sequencing labels, not competitive parameters.

## Metrics

- time from opening a stack to a recorded decision;
- percentage of close calls resolved without leaving the workspace;
- decision reversal and restore rate;
- evidence/degraded-state comprehension in usability tests;
- keyboard adoption and focus-management defects;
- diagnostics bundles sufficient for support triage; and
- first-grid, detail-open, memory, and cancellation distributions.

## Non-goals

- Reimplementing model inference or scoring in the renderer.
- Displaying proprietary terminology, copy, assets, or calibrated thresholds.
- Treating experimental evidence as a destructive-action authorization.
- Duplicating backend schema or API authority in local TypeScript types.
- Adding backlog commitments merely by publishing this proposal.

---
type: Guide
title: Agent cull review (Gallery operator)
description: How the Agent cull review panel works in Driftara Gallery and what to do when the backend cannot reach the Gemini CLI.
resource: docs/guides/04-agent-cull-review.md
tags: [gallery-docs, guides, culling, agent-cull-review]
timestamp: 2026-06-30T00:00:00Z
okf_version: 0.1
---

# Agent cull review (Gallery operator)

The **Agent cull review** banner appears when viewing a stack or substack with the Stacks toggle on. It calls the backend `POST /api/culling/agent-review/run` (dry-run by default). The review itself is metadata-only — it proposes removal **candidates**; no files are deleted or moved during dry-run, live run, approve, or mark-candidates. The **only** step that touches the filesystem is the explicit, confirmation-gated **Delete approved** action (step 6 below), which permanently deletes files + DB records.

**Backend setup (authoritative):** [image-scoring-backend — Agent cull review Gemini CLI setup](https://github.com/synthet/image-scoring-backend/blob/main/docs/guides/setup/agent-cull-review-gemini-cli.md)

## UI components

| Piece | Location |
|-------|----------|
| `AgentCullReviewPanel` | `src/components/CullingAnalytics/AgentCullReviewPanel.tsx` |
| Shared review state (panel + grid) | `src/hooks/useAgentCullReview.ts` |
| Thumbnail overlays / hover actions | `src/components/Gallery/GalleryGrid.tsx` (`agentRecommendations`, `onAgentAction`, `highlightImageId`) |
| Labels, tone, summary digest | `src/components/CullingAnalytics/analyticsChipLabels.ts` (`friendlyAgentError`, `agentRecommendationTone`, `formatAgentSummaryDigest`) |
| IPC | `electron/apiService.ts` → `runAgentCullReview`, `getAgentCullGroups`, … |

The panel and the gallery grid share **one** fetch via `useAgentCullReview`, mounted once in
`AppContent`. The panel renders recommendation **cards**; the grid renders matching **thumbnail
overlays** (tone border, badge, hover Approve/Dismiss). Clicking a card scrolls the grid to that
image and briefly highlights it.

## Workflow

The panel header shows a stepper: **Dry-run → Review → Live run → Mark candidates**.

1. Open a stack with picks and rejects (sub-stack leaf or flat stack). Single-sub-stack roots auto-open the sub-stack detail view — see [features/implemented/08-stack-substack-navigation.md](../features/implemented/08-stack-substack-navigation.md).
2. Click **Run dry-run review** (`dryRun: true`) → status `proposed`. Recommendations are
   metadata-only proposals; no file is deleted or moved. Each card shows the image **thumbnail**
   next to its filename.
3. **Review** each card. On a **dry-run** group, **Approve** is hidden (the backend can't mark
   candidates yet) — use **Keep in review** to dismiss, the overflow (⋯) for **Clear pick flag** /
   **Roll back**, or **Dismiss all** for bulk. Picked-image **advisories** are info-only. The card
   thumbnail (or its filename) jumps the grid to that image.
4. Click **Run live review** (`dryRun: false`) → status `validated`. This re-runs on top of the
   dry-run group (sent with `force`), so it no longer fails with *“A review already exists.”* Still
   metadata-only — it records operator-facing remove **candidates**, it does not delete files. Once
   validated, **Approve** / **Approve all removals** become available.
5. Click **Mark safe candidates** to apply (shown only on a non-dry-run group).
6. **(Destructive, optional)** Once you've **Approved** removals on a validated group, a red
   **Delete N approved…** button appears. It opens a confirmation dialog listing the exact
   filenames and warns the action is **irreversible** (files are **not** sent to the Recycle Bin —
   the backend deletes them from inside its Linux container). Confirming calls
   `POST /api/culling/agent-review/groups/{id}/delete-approved` (`confirm: true`), which permanently
   removes each approved image's **file, thumbnails, and DB record** and marks the recommendation
   `operator_deleted`. Per-image **Approve** stays reversible; this final delete is the only step
   that touches the filesystem.

   **Note:** After **Delete N approved…**, the agent review panel refreshes but the gallery grid may
   still list deleted images until a follow-up wires `removeImageFromActiveGrid` — see
   [07-grid-delete-state-sync.md](../features/implemented/07-grid-delete-state-sync.md) (known follow-up).

If picks change after a review, applying returns `stale_group_state` (HTTP 409); the panel shows a
**Re-run the dry-run review** prompt — re-run before approving/applying.

## Picked-image quality advisories

When backend `culling.agent_review.review_picked_quality` is enabled, the agent may return
**quality advisories** on **picked** images (e.g. misfocus on a high `score_technical` hero). These
persist as `candidate_status: pick_quality_advisory` / `agent_decision: advisory`.

| Gallery signal | Meaning |
|----------------|---------|
| Panel chip **Quality advisory** | Info-only card — no Approve, no file changes |
| Header chip **N advisories** | Count of advisory rows in the current group |
| Grid blue overlay / **Advisory** badge | Same row highlighted on thumbnails |
| **View alternative** (when present) | Focuses a sharper picked id from backend `suggested_alternatives` |

Backend must use the **strict_v2** picked audit snippet (production default since 2026-06-21) or
equivalent study mode for advisories to appear on misfocus-prone stacks. Research and operator
verification: [reports/08-picked-advisory-gap-2026-06-21.md](../reports/08-picked-advisory-gap-2026-06-21.md)
(backend detail: [PICKED_ADVISORY_GAP_195193_2026-06-21.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/PICKED_ADVISORY_GAP_195193_2026-06-21.md)).

## “Gemini CLI was not found” (fixed setup)

Gallery shows this when the backend returns `agent_cli_not_found` — the WebUI process could not spawn `culling.agent_review.agent.command`.

**Most common cause (Docker):** `config.json` used a WSL host path (`/mnt/d/Projects/...`) while the WebUI runs in the **`image-scoring-webui` container**, where the repo is `/app`. Use `/app/scripts/wsl/gemini_agent.sh`, rebuild the image (Gemini CLI baked in), and set `GEMINI_CONFIG_SOURCE` in backend `.env`. Full steps: backend guide linked above.

After backend fix, restart the WebUI container and retry **Run dry-run review** — the yellow PATH message should disappear.

## Other backend errors

| Message (friendly) | Backend code | Action |
|--------------------|--------------|--------|
| Agent cull review is disabled… | `agent_review_disabled` | Enable `culling.agent_review.enabled` in backend `config.json` |
| Picks changed since this review… | `stale_group_state` | Re-run dry-run review |
| This is a dry-run review… | `dry_run_group` | Re-run without dry-run to apply |

## Related

- [Stack and sub-stack navigation](../features/implemented/08-stack-substack-navigation.md) — drill-down levels; single sub-stack auto-open
- [Culling stack analytics](../features/implemented/06-culling-stack-analytics.md) — sibling analytics banner on the same views
- [Grid delete state sync](../features/implemented/07-grid-delete-state-sync.md) — ImageViewer delete grid pruning (agent batch delete follow-up noted there)
- [Picked advisory gap (2026-06-21)](../reports/08-picked-advisory-gap-2026-06-21.md) — backend research cross-ref + gallery verification
- [Agent-assisted cull review worklog](../specs/agent-assisted-cull-review/worklog.md)
- Backend spec: [agent-assisted-cull-review](https://github.com/synthet/image-scoring-backend/tree/main/docs/specs/agent-assisted-cull-review)

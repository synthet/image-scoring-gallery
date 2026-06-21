---
type: Guide
title: Agent cull review (Gallery operator)
description: How the Agent cull review panel works in Driftara Gallery and what to do when the backend cannot reach the Gemini CLI.
resource: docs/guides/04-agent-cull-review.md
tags: [gallery-docs, guides, culling, agent-cull-review]
timestamp: 2026-06-18T00:00:00Z
okf_version: 0.1
---

# Agent cull review (Gallery operator)

The **Agent cull review** banner appears when viewing a stack or substack with the Stacks toggle on. It calls the backend `POST /api/culling/agent-review/run` (dry-run by default). No files are deleted or moved — only metadata-only removal **candidates** are proposed.

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

1. Open a stack with picks and rejects (sub-stack leaf or flat stack).
2. Click **Run dry-run review** (`dryRun: true`) → status `proposed`. Recommendations are
   metadata-only proposals; no file is deleted or moved.
3. **Review** each card: **Approve** a removal, **Keep in review** to dismiss, or use the overflow
   (⋯) for **Clear pick flag** / **Roll back**. Picked-image **advisories** are info-only — they
   never expose Approve. Use **Approve all removals** / **Dismiss all** for bulk.
4. Click **Run live review** (`dryRun: false`) → status `validated`. Still metadata-only — this
   records operator-facing remove **candidates**, it does not delete files.
5. Click **Mark safe candidates** to apply (shown only on a non-dry-run group).

If picks change after a review, applying returns `stale_group_state` (HTTP 409); the panel shows a
**Re-run the dry-run review** prompt — re-run before approving/applying.

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

- [Culling stack analytics](../features/implemented/06-culling-stack-analytics.md) — sibling analytics banner on the same views
- [Agent-assisted cull review worklog](../specs/agent-assisted-cull-review/worklog.md)
- Backend spec: [agent-assisted-cull-review](https://github.com/synthet/image-scoring-backend/tree/main/docs/specs/agent-assisted-cull-review)

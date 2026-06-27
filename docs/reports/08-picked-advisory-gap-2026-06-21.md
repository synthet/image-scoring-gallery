---
type: Report
title: Picked-image quality advisory gap (gallery cross-reference)
description: Gallery operator and UI notes for backend picked_image_advisories research on stack 29157 / image 195193; links to backend fix and panel behavior.
resource: docs/reports/08-picked-advisory-gap-2026-06-21.md
tags: [gallery-docs, reports, agent-cull-review, culling, cross-repo]
timestamp: 2026-06-21T18:00:00Z
okf_version: 0.1
---

# Picked-image quality advisory gap (gallery cross-reference)

Point-in-time integration note for **Driftara Gallery** after backend research on stack **#29157** / image **195193** (`DSC_8825.NEF`): a picked hero with high `score_technical` but vision-detectable foreground misfocus.

**Backend authority (full forensics + A/B):** [image-scoring-backend — PICKED_ADVISORY_GAP_195193_2026-06-21.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/PICKED_ADVISORY_GAP_195193_2026-06-21.md)

## Gallery impact

The gallery **already renders** `pick_quality_advisory` rows from `GET /api/culling/agent-review/groups`:

| UI surface | Behavior |
|------------|----------|
| `AgentCullReviewPanel` | Info cards with **Quality advisory** badge; no Approve/Dismiss removal actions |
| `GalleryGrid` | Blue/info thumbnail overlay and **Advisory** badge |
| `analyticsChipLabels.ts` | `pick_quality_advisory` → "Quality advisory"; tone `advisory` |

Advisories are **informational only** — they never change `pick_status` or offer removal approval.

## Why operators saw nothing before the backend fix

Backend live reviews viewed picked thumbnails (`vision_used: true`) but returned an empty `picked_image_advisories` array due to **prompt wording** in the full packet. The gallery had nothing to display. After backend promotion of `picked_quality_audit_snippet_strict_v2.txt`, dry-run/live reviews on stack #29157 should return advisory rows the panel can show.

## Operator workflow (gallery)

1. Open stack **#29157** (or any stack with picks) with **Stacks** toggle on.
2. **Run dry-run review** — wait for `proposed` status.
3. Look for blue **Quality advisory** cards (count chip in panel header when present).
4. Click a card to focus the grid on the advised pick; use **better alternatives** links when the backend populated `suggested_alternatives`.
5. Treat advisories as editorial hints — re-pick manually in the gallery if you agree; no backend **Apply** path exists for advisories.

Ensure backend `culling.agent_review.review_picked_quality: true` and the WebUI container has been restarted after config changes. See [guides/04-agent-cull-review.md](../guides/04-agent-cull-review.md).

## Verification (cross-repo)

Backend matrix (Docker):

```bash
docker exec image-scoring-webui env PYTHONPATH=/app python3 \
  /app/scripts/study/agent_cull_matrix.py \
  --stacks-file /app/.agent/study/fixtures/misfocus_stack.json \
  --modes technical_focus_strict_picks \
  --live-modes technical_focus_strict_picks \
  --runtimes docker --skip-vision-smoke
```

Gallery: re-run dry-run on stack #29157 and confirm a **Quality advisory** card for **DSC_8825.NEF** (image 195193).

## Related

- [Agent cull review (Gallery operator)](../guides/04-agent-cull-review.md)
- [Culling stack analytics](../features/implemented/06-culling-stack-analytics.md)
- [Agent-assisted cull review — gallery worklog](../specs/agent-assisted-cull-review/worklog.md)
- Backend study harness: [agent-cull-cli-matrix.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/study/agent-cull-cli-matrix.md)

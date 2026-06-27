---
type: "Implemented Feature"
title: "Culling stack analytics (Driftara Gallery)"
description: "Status: Implemented (MVP)"
resource: "docs/features/implemented/06-culling-stack-analytics.md"
tags: ["features", "gallery-docs", "implemented"]
timestamp: 2026-06-21T18:00:00Z
---

# Culling stack analytics (Driftara Gallery)

**Status:** Implemented (MVP)  
**Backend:** [image-scoring-backend `CULLING_ANALYTICS.md`](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/CULLING_ANALYTICS.md)

## Summary

Folder/stacks **Culling insights** panel and per-stack **analytics banner** call the Python backend:

- `GET /api/analytics/culling` — library or folder scope
- `GET /api/analytics/stacks/{stack_id}` — drill-down

IPC: `api:get-culling-analytics`, `api:get-stack-analytics` via `electron/apiService.ts`.

## UI

| Component | Location |
|-----------|----------|
| `StackAnalyticsBanner` | Above gallery grid when viewing stack members — auto-cull decision counts (pick/reject/neutral) plus similarity/burst chips |
| `AgentCullReviewPanel` | Agent-assisted redundancy review (dry-run default); errors mapped in `analyticsChipLabels.ts` — see [guides/04-agent-cull-review.md](../../guides/04-agent-cull-review.md) |
| `GalleryGrid` member cards | Per-image **Picked** / **Rejected** chips when drilled into a stack (flat or sub-stack leaf) |

## Regression

- `src/components/CullingAnalytics/*.test.tsx` (Vitest, mocked API)
- `npx tsc --noEmit` after API type changes

## Related

- Backend **pipeline input-size study** (embedding resolution vs burst grouping): [reports/07-pipeline-input-size-study-2026-05.md](../../reports/07-pipeline-input-size-study-2026-05.md) — stack quality in the gallery depends on backend clustering/embeddings, not renderer pixel budget.
- Gallery follow-up when policy is signed off: [#138](https://github.com/synthet/image-scoring-gallery/issues/138) (`cross-repo`, Backlog).
- Agent cull review operator guide: [guides/04-agent-cull-review.md](../../guides/04-agent-cull-review.md).
- Picked-image quality advisories (backend research, gallery UI): [reports/08-picked-advisory-gap-2026-06-21.md](../../reports/08-picked-advisory-gap-2026-06-21.md).

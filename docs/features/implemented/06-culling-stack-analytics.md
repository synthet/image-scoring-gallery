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
| `CullingInsightsPanel` | Sidebar above Stacks toggle when stacks mode or folder selected |
| `StackAnalyticsBanner` | Above gallery grid when viewing stack members |

## Regression

- `src/components/CullingAnalytics/*.test.tsx` (Vitest, mocked API)
- `npx tsc --noEmit` after API type changes

## Summary

Gallery cross-repo follow-up for the backend **pipeline input-size study**: monitor unified pixel policy sign-off and document any gallery-side actions (thumbnail backfill UX, `media://` perf) if backend raises `MAX_SIZE`.

**Backend epic:** [#260](https://github.com/synthet/image-scoring-backend/issues/260)

## Acceptance criteria

- [ ] Wiki page current: [`docs/reports/07-pipeline-input-size-study-2026-05.md`](docs/reports/07-pipeline-input-size-study-2026-05.md)
- [ ] When backend Phase 6 completes: update wiki with adopted tiers (or explicit "no gallery change")
- [ ] If `MAX_SIZE` increases: note whether gallery needs perf testing or user-facing backfill messaging (no schema change expected)
- [ ] Link from [`06-culling-stack-analytics.md`](docs/features/implemented/06-culling-stack-analytics.md) remains accurate

## Out of scope

- Changing backend thumbnail generation (backend-owned)
- Inventing `MAX_SIZE` or config keys before backend sign-off

## Canonical backend docs

- https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/UNIFIED_INPUT_POLICY_2026-05-31.md
- https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/INPUT_SIZE_CULLING_PRELIMINARY_2026-05-30.md

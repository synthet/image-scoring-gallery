# Pipeline input-size study — gallery cross-reference (May 2026)

**Purpose:** Record how the sibling **image-scoring-backend** pipeline-wide input-size research affects Driftara Gallery display quality, stacks/culling UX, and when gallery code might need coordinated changes.

**Authority:** Study design, harness, metrics, and production policy live in **image-scoring-backend** only. This page is a consumer-oriented pointer — do not treat it as the runbook.

## Backend canonical sources

| Document | Role |
|----------|------|
| [INPUT_SIZE_CULLING_2026-05-29.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/INPUT_SIZE_CULLING_2026-05-29.md) | Runbook (embedding, IQA, tagging, caption tracks) |
| [INPUT_SIZE_CULLING_PRELIMINARY_2026-05-30.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/INPUT_SIZE_CULLING_PRELIMINARY_2026-05-30.md) | Status memo, model inventory, phased plan |
| [UNIFIED_INPUT_POLICY_2026-05-31.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/UNIFIED_INPUT_POLICY_2026-05-31.md) | Tiered pixel-budget draft (gated until eval sign-off) |
| [MODEL_INPUT_SPECIFICATIONS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/MODEL_INPUT_SPECIFICATIONS.md) | Production IQA / MUSIQ resize rules |

Artifacts: `reports/clip-culling/input-size/` in the backend repo (`native_input_sizes.json`, NPZ caches, `SUMMARY.md`).

## What the study measures

The backend study sweeps **long-edge pixel budget** (thumbnail vs file decode, RAW→JPEG square size, optional ViT preprocess override) across:

| Pipeline output | Gallery consumer |
|-----------------|------------------|
| Burst stacks / similarity clustering | Stack grid, stack analytics, pick/reject UX — see [06-culling-stack-analytics.md](../features/implemented/06-culling-stack-analytics.md) |
| Quality scores / ratings | Score badges, sort/filter, auto-rating thresholds |
| Keywords / tags | Sidebar filters, search, tag propagation neighbors |
| BLIP captions | Accessibility / metadata fields when surfaced in UI |
| Embedding similarity | Similar-image and text-search flows |

**Baseline for deltas:** `long_edge=512`, `source=thumb` (matches backend `modules/thumbnails.py` `MAX_SIZE=512` today).

## Gallery relevance (no code changes yet)

1. **Thumbnails are backend-owned.** Gallery reads `thumbnail_path` / `thumbnail_path_win` from PostgreSQL or API SQL ([electron/db.ts](../../electron/db.ts)); it does not set ML input resolution. If the study recommends raising `MAX_SIZE`, gallery benefits from sharper grid tiles without renderer changes — but existing thumbs would need backend regeneration/backfill.

2. **Stacks and culling analytics depend on embedding quality.** Poor burst grouping at low resolution surfaces as wrong stack membership in the gallery grid and in `/api/analytics/culling` metrics. Input-size ARI improvements are invisible in Electron until clustering re-runs on updated embeddings.

3. **Keywords and scores are read-only in gallery.** Tag diversity and mishot-detection improvements appear after backend re-scoring/tagging; gallery IPC/SQL shapes stay the same unless schema or API contracts change (unlikely for this study).

4. **Do not change production defaults from this memo.** Backend guardrail: policy tiers ship only after Phase 6 eval sign-off. Gallery agents should link here and to backend docs, not invent `MAX_SIZE` or config keys.

## When gallery might need coordinated work

| Backend outcome | Possible gallery follow-up |
|-----------------|---------------------------|
| `MAX_SIZE` 512 → 768 | Verify `media://` performance; optional UI note during thumb backfill; no schema change |
| Culling embedder `max_load_px` change | None in gallery (backend clustering only) |
| `raw_conversion.max_resolution` change | None in gallery (scoring pipeline only) |
| New embedding space or column | Cross-repo contract per [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) |

## Related gallery docs

- [06-culling-stack-analytics.md](../features/implemented/06-culling-stack-analytics.md) — stack/culling analytics UI
- [technical/EMBEDDING_SPACES.md](../technical/EMBEDDING_SPACES.md) — which embedding spaces the gallery reads vs backend-only towers
- [architecture/01-system-overview.md](../architecture/01-system-overview.md) — `media://` thumbnail serving
- [CANONICAL_SOURCES.md](../CANONICAL_SOURCES.md) — backend authority map

## Status (2026-05-31)

Backend harness extended (embedding, IQA, tagging, caption tracks); Phase 0 native sizes recorded; full NPZ/eval grid **pending** detached WSL run. Re-check this page when [UNIFIED_INPUT_POLICY_2026-05-31.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/UNIFIED_INPUT_POLICY_2026-05-31.md) contains per-track best configs (not placeholder).

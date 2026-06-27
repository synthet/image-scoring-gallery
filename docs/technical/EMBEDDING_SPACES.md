---
type: "Technical Reference"
title: "Embedding spaces (gallery reference)"
description: "Gallery-facing map of which backend embedding spaces exist, which the desktop app reads today, and which are backend-only opt-in towers — so agents do not assume DINOv2, SigLIP2, o"
resource: "docs/technical/EMBEDDING_SPACES.md"
tags: ["gallery-docs", "technical"]
timestamp: 2026-06-21T00:00:00Z
---

# Embedding spaces (gallery reference)

Gallery-facing map of **which backend embedding spaces exist**, **which the desktop app reads today**, and **which are backend-only opt-in towers** — so agents do not assume DINOv2, SigLIP2, or OpenAI CLIP L/14 are in the production path.

## Source of truth (backend)

| Topic | Canonical source |
|-------|------------------|
| Registry, dimensions, producers | [image-scoring-backend EMBEDDINGS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/EMBEDDINGS.md) |
| Space codes and defaults | [modules/embedding_spaces.py](https://github.com/synthet/image-scoring-backend/blob/main/modules/embedding_spaces.py) |
| Optional culling towers (extractors) | [modules/embedding_extractors.py](https://github.com/synthet/image-scoring-backend/blob/main/modules/embedding_extractors.py) |
| Culling model spike / verdicts | [CULLING_MODEL_RECOMMENDATION_2026-05-29.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/CULLING_MODEL_RECOMMENDATION_2026-05-29.md) |
| Input-size / pixel-budget study | [INPUT_SIZE_CULLING_2026-05-29.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/INPUT_SIZE_CULLING_2026-05-29.md); gallery pointer [07-pipeline-input-size-study-2026-05.md](../reports/07-pipeline-input-size-study-2026-05.md) |
| Two-level culling config | [two-level-culling.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/planned/embeddings/two-level-culling.md) |

Do not invent space codes or dimensions here — link to backend docs when they change.

## What the gallery uses today

The Electron main process **hardcodes the default visual space** `mobilenet_v2_imagenet_gap` (1280-d MobileNetV2) for local embedding reads:

| Feature | Code path | Space |
|---------|-----------|-------|
| Backup MMR / dedup | [`electron/db.ts`](../../electron/db.ts) `getEmbeddingsBatch`, near-duplicate SQL | `mobilenet_v2_imagenet_gap` |
| Backup diversity | [`electron/backupDiversity.ts`](../../electron/backupDiversity.ts) | vectors from above |
| Similar-image API (when used) | [`electron/apiService.ts`](../../electron/apiService.ts) → backend `/api/similarity/*` | backend default unless `embedding_space` query param set |

The gallery **does not** query `dinov2_reg_base_image`, `siglip2_base_image`, or `openai_clip_vit_l14_image`. No renderer or IPC surface exposes multi-space culling tower selection.

Semantic text search uses **`clip_vit_b32_image`** (512-d) on the backend only — gallery calls the REST endpoint; it does not read CLIP vectors from Postgres directly.

## Registered spaces (summary)

Backend PostgreSQL stores vectors in `image_embeddings` (1280-d), `image_embeddings_512`, or `image_embeddings_768` keyed by `embedding_spaces.code`.

| Space code | Dim | Production default? | Gallery reads? |
|------------|-----|---------------------|----------------|
| `mobilenet_v2_imagenet_gap` | 1280 | **Yes** — culling/clustering, similar search default | **Yes** (backup, dedup) |
| `clip_vit_b32_image` | 512 | Yes — keywords phase piggyback | No (API text-search only) |
| `bioclip_2_image` | 768 | Yes — bird-species phase | No |
| `blip_vit_b16_image` | 768 | Yes — captions (keywords) | No |
| `openclip_l14_laion2b_image` | 768 | Opt-in via `embeddings.culling_spaces` | No |
| `openai_clip_vit_l14_image` | 768 | Opt-in / backfill only | No |
| `siglip2_base_image` | 768 | Opt-in / backfill only | No |
| `dinov2_reg_base_image` | 768 | Opt-in / backfill only | No |

## Optional culling towers (not default)

These three spaces were evaluated in the backend **2026-05-29 culling spike**. They are **registered in the DB** and **implemented in** `embedding_extractors.py`, but:

- **Not generated** during normal pipeline runs.
- Produced only when listed in backend `config.json` → `embeddings.culling_spaces` or via `scripts/maintenance/backfill_culling_embeddings.py`.
- Selectable for backend **two-level culling** via `culling.two_level.level*.embedding_space` only after vectors exist.

| Space | Model (backend) | Spike verdict |
|-------|-----------------|---------------|
| `openai_clip_vit_l14_image` | OpenCLIP `ViT-L-14-quickgelu/openai` | Strong (ARI ~0.44); below `openclip_l14_laion2b_image` |
| `siglip2_base_image` | HF `google/siglip2-base-patch16-224` | Mid-pack (ARI ~0.43) |
| `dinov2_reg_base_image` | timm `vit_base_patch14_dinov2.lvd142m` | **HOLD** — underperformed MobileNet (ARI ~0.38) |

`config.example.json` in the backend lists only `openclip_l14_laion2b_image` in `culling_spaces`, not these three.

## If gallery needs multi-space support later

Planned embedding UI ([features/planned/embeddings/](../features/planned/embeddings/README.md)) assumes backend REST/MCP for similarity, duplicates, and map projection — not direct reads of optional 768-d towers. Before wiring a space picker in the desktop app:

1. Confirm backend API exposes the space (`GET /api/embedding_spaces`, `embedding_space` on similarity/map routes).
2. Extend [`electron/db.ts`](../../electron/db.ts) or prefer API calls — do not hardcode new space codes in multiple files without a shared constant.
3. Update this page and [CANONICAL_SOURCES.md](../CANONICAL_SOURCES.md); coordinate via backend [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md).

## Related gallery docs

- [Pipeline input-size study (gallery)](../reports/07-pipeline-input-size-study-2026-05.md) — pixel budget vs stacks/thumbnails; gallery [#138](https://github.com/synthet/image-scoring-gallery/issues/138), backend [#260](https://github.com/synthet/image-scoring-backend/issues/260).
- [Embedding Applications hub](../features/planned/embeddings/README.md) — planned UI features (MobileNet-centric).
- [Single Bird Species per Image (BioCLIP top‑1)](../features/planned/species-conflict-resolution.md) — the bird-species phase that populates `bioclip_2_image`; planned `top_k=1` change so each bird image gets one `species:*` keyword.
- [Backup feature](../architecture/backup-feature.md) — MMR dedup uses default-space embeddings.
- [DATABASE_REFACTOR_ANALYSIS.md](DATABASE_REFACTOR_ANALYSIS.md) — gallery does not query legacy `images.image_embedding` directly.

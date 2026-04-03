# Database Refactor Compatibility Analysis

## Overview
This document analyzes the impact of the proposed [DB_VECTORS_REFACTOR.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/plans/database/DB_VECTORS_REFACTOR.md) on the **image-scoring-gallery** (Electron) application.

## Compatibility Matrix

| Refactor Phase | Impact | Risk Level | Required Actions |
| :--- | :--- | :--- | :--- |
| **Multi-Type Vectors** | Low | 🟢 Low | None (uses legacy columns). |
| **Keywords Normalization (A0)** | Medium | 🟢 Low | Implemented (Compatibility Mode) — `db.ts` updated. |
| **Scores Fact Table (A1)** | High | 🔴 High | Update all query logic or use DB VIEWS. |
| **Stack Cache** | Medium | 🟡 Medium | Sync `stack_cache` schema with `image_scores`. |

## Detailed Analysis

### 1. Multi-Type Vectors (Primary Goal)
The gallery application does not currently perform its own similarity search or query the `image_embedding` column directly in the Electron main process. Since the refactor plan includes a "dual-read/dual-write" strategy, the gallery remains compatible by default.

### 2. Keywords Normalization (Phase A0)
The gallery relies on the denormalized `images.keywords` column for filtering in `getImages`, `getStacks`, and `getImagesByStack`.
- **Current Pattern**: `WHERE keywords LIKE '%...%'`
- **Required Pattern**: `EXISTS (SELECT 1 FROM image_keywords ik JOIN keywords_dim kd ON ik.keyword_id = kd.id WHERE ik.image_id = i.id AND kd.keyword_norm = '...')`

### 3. Scores Fact Table (Phase A1)
This is the most significant risk. The gallery explicitly selects `score_general`, `score_technical`, `score_aesthetic`, etc., in almost every query.
- **Breaking Change**: Removing these columns from the `images` table will break the UI entirely.
- **Mitigation**: Provide a database `VIEW` named `images_legacy` or update the `images` table to be a view that joins the fact table, ensuring no changes are needed in the Electron layer during the transition.

### 4. Stack Cache
The gallery's internal `stack_cache` table denormalizes scores to avoid expensive aggregations. If the source score columns change, the `rebuildStackCache` function in `electron/db.ts` must be updated to aggregate from the new `image_scores` table.

## Maintenance
Last updated: April 2026 (Ref: DB_VECTORS_REFACTOR analysis)

---
type: "Technical Reference"
title: "Database Refactor Compatibility Analysis"
description: "This document analyzes the impact of the proposed DBVECTORSREFACTOR.md on the image-scoring-gallery (Electron) application."
resource: "docs/technical/DATABASE_REFACTOR_ANALYSIS.md"
tags: ["gallery-docs", "technical"]
timestamp: 2026-06-16T00:00:00Z
---

# Database Refactor Compatibility Analysis

## Overview
This document analyzes the impact of the proposed [DB_VECTORS_REFACTOR.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/database/DB_VECTORS_REFACTOR.md) on the **image-scoring-gallery** (Electron) application.

## Compatibility Matrix

| Refactor Phase | Impact | Risk Level | Required Actions |
| :--- | :--- | :--- | :--- |
| **Multi-Type Vectors** | Low | 🟢 Low | None (uses legacy columns). |
| **Keywords Normalization (A0)** | Medium | 🟢 Low | Implemented (Compatibility Mode) — `db.ts` updated. |
| **Scores Fact Table (A1)** | High | 🔴 High | Update all query logic or use DB VIEWS. |
| **Stack Cache** | Medium | 🟡 Medium | Sync `stack_cache` schema with `image_scores`. |

## Detailed Analysis

### 1. Multi-Type Vectors (Primary Goal)
Backup MMR/dedup reads **`image_embeddings`** for the default space `mobilenet_v2_imagenet_gap` via [`electron/db.ts`](../../electron/db.ts) — not optional 768-d culling towers. See [EMBEDDING_SPACES.md](EMBEDDING_SPACES.md) for the full registry and gallery scope.

The gallery does not run general similarity search in-process (that goes through backend REST). Legacy `images.image_embedding` is not queried directly. Multi-space pgvector tables remain backend-owned; gallery stays compatible as long as default-space rows exist for backup.

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

---
type: "Technical Reference"
title: "Pipeline terminology (Electron gallery)"
description: "This app mirrors the canonical stage names defined in image-scoring-backend so labels match the Gradio Pipeline tab and the backend Vite SPA (/ui/)."
resource: "docs/technical/PIPELINE_TERMINOLOGY.md"
tags: ["gallery-docs", "technical"]
timestamp: 2026-06-16T00:00:00Z
---

# Pipeline terminology (Electron gallery)

This app mirrors the **canonical stage names** defined in **image-scoring-backend** so labels match the Gradio Pipeline tab and the backend Vite SPA (`/ui/`).

## Source of truth

| Location | Role |
|----------|------|
| Backend | [`frontend/src/types/api.ts`](https://github.com/synthet/image-scoring-backend/blob/main/frontend/src/types/api.ts) — `STAGE_DISPLAY` |
| Gallery (this repo) | [`src/constants/pipelineLabels.ts`](../../src/constants/pipelineLabels.ts) — `STAGE_DISPLAY`, `PIPELINE_OPERATION_LABEL`, `BACKEND_JOB_TYPE_LABEL` |

Keep gallery strings in sync when backend `STAGE_DISPLAY` changes.

## User-visible mapping (summary)

| API submit `operations` | User label in UI |
|---------------------------|------------------|
| `indexing` | Discovery |
| `metadata` | Inspection |
| `score` | Quality Analysis |
| `tag` | Tagging |
| `cluster` | Similarity Clustering |

WebSocket/API `job_type` values (`scoring`, `tagging`, `clustering`, …) are mapped via `BACKEND_JOB_TYPE_LABEL` for progress bars and notifications.

## Runs vs jobs

The renderer uses **run** in labels (e.g. Pipeline page, notifications) while the backend still exposes `job_id` — see backend [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md).

## Sync and phase heuristics

**Sync from device** registers files and marks **`indexing`** (Discovery) complete before submitting later phases. The **ImageViewer** “Phases” block uses heuristics (not raw `image_phase_status`). See **[../features/implemented/06-sync-from-device-workflow.md](../features/implemented/06-sync-from-device-workflow.md)** and backend **[ELECTRON_SYNC_IMPORT_AND_PHASES.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/ELECTRON_SYNC_IMPORT_AND_PHASES.md)**.

## Full reference

**[image-scoring-backend/docs/technical/PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md)**

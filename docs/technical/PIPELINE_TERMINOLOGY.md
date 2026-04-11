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

## Full reference

**[image-scoring-backend/docs/technical/PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md)**

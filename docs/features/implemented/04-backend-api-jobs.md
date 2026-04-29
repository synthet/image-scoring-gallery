# Backend API and jobs (Electron integration)

**Purpose:** Start and monitor **scoring**, **tagging**, **clustering**, and **pipeline** work on the Python WebUI from the Electron main process, and surface **job queue** / **recent jobs** / **scope tree** data in the UI.

**User-visible behavior:** Toolbar and modals trigger long-running jobs; status polling shows runner progress; cancel queued jobs; optional MCP-style helpers (`mcp-find-duplicates`, `mcp:search-similar`, `api:outliers`) delegate to backend similarity endpoints.

**Primary code paths:** `electron/apiService.ts` (typed `GET`/`POST` to `/api/...`), IPC handlers `api:*` in `electron/main.ts` (e.g. `api:scoring-start`, `api:tagging-start`, `api:clustering-start`, `api:pipeline-submit`, `api:pipeline-skip`, `api:pipeline-retry`, `api:jobs-queue`, `api:jobs-recent`, `api:job-detail`, `api:job-cancel`, `api:get-scope-tree`, `api:health`, `api:status`, `api:stats`).

**Representative REST paths used by `ApiService`:** `/api/scoring/*`, `/api/tagging/*`, `/api/clustering/*`, `/api/pipeline/*`, `/api/phases/decision`, `/api/similarity/*`, `/api/import/register`, `/api/folders/rebuild`, `/api/images`, `/api/jobs/*`, `/api/scope/tree`, `/api/raw-preview`, `/source-image`.

**Related docs:** Backend [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md) · Backend shipped catalog [01-pipeline-and-runs.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/01-pipeline-and-runs.md) · [02-scoring-and-models.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/02-scoring-and-models.md)

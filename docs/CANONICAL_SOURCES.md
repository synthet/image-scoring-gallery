# Canonical sources — image-scoring-gallery

Use this page before changing integration contracts, stage naming, or data access patterns. **Schema and REST behavior are owned by image-scoring-backend**; this repo documents the **desktop app** and links to the backend for authority.

| Topic | Canonical location |
|--------|---------------------|
| Cross-repo protocols (API/IPC/schema changes) | **Backend:** [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) · **Local stub:** [`technical/AGENT_COORDINATION.md`](technical/AGENT_COORDINATION.md) |
| Pipeline vocabulary (UI labels vs `phase_code` / REST) | **Backend:** [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md) · **Local:** [`technical/PIPELINE_TERMINOLOGY.md`](technical/PIPELINE_TERMINOLOGY.md) · **Renderer:** `src/constants/pipelineLabels.ts` |
| REST API contract (paths, payloads) | **Backend:** [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md), [openapi.yaml](https://github.com/synthet/image-scoring-backend/blob/main/docs/reference/api/openapi.yaml) |
| Database access modes (`pg` vs `api`) | [`architecture/02-database-design.md`](architecture/02-database-design.md) |
| Electron query layer and IPC | `electron/db.ts`, `electron/db/provider.ts`, `electron/main.ts`, `preload` / IPC definitions |
| HTTP client to the Python WebUI | `electron/apiService.ts` |
| Runtime wiring (backend URL, lock file) | [`guides/02-api-backend-config.md`](guides/02-api-backend-config.md), repo-root `config.json` |
| Backend local health (`python scripts/doctor.py`), support bundles, MCP triage | **Backend:** [DIAGNOSTICS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DIAGNOSTICS.md), [DEVELOPMENT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DEVELOPMENT.md); gallery: [`DEVELOPMENT.md`](DEVELOPMENT.md) (`npm run doctor`) |
| Backlog and mirror sync | [`project/00-backlog-workflow.md`](project/00-backlog-workflow.md), root [`../TODO.md`](../TODO.md) |
| Wiki structure | [`WIKI_SCHEMA.md`](WIKI_SCHEMA.md), [`log.md`](log.md) |
| UI palette, tokens, icons (Electron + CSS Modules) | Local stub: [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md) (**canonical:** [DESIGN_SYSTEM.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/design/DESIGN_SYSTEM.md) in **image-scoring-backend**) |

**See also:** [Documentation README](README.md)

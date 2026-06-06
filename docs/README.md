# Driftara Gallery Documentation

This is the documentation hub for **image-scoring-gallery**, the Electron + React + TypeScript desktop app for browsing Vexlum Scoring libraries.

The backend owns REST API contracts, database schema, and pipeline phase terminology. The gallery owns Electron architecture, IPC/preload boundaries, renderer behavior, API-client usage, and desktop workflows.

## Backend Authority

| Topic | Backend authority |
|---|---|
| Backend docs hub | [image-scoring-backend docs/README.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/README.md) |
| Backend full index | [image-scoring-backend docs/INDEX.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/INDEX.md) |
| REST API contract | [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md), [openapi.yaml](https://github.com/synthet/image-scoring-backend/blob/main/docs/reference/api/openapi.yaml) |
| Database schema | [DB_SCHEMA.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/DB_SCHEMA.md), [DATABASE.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DATABASE.md) |
| Pipeline terminology | [PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md) |
| Cross-repo protocol | [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) |
| Diagnostics / doctor | [DIAGNOSTICS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DIAGNOSTICS.md) |

## Architecture

- [architecture/README.md](architecture/README.md) - architecture section index.
- [architecture/01-system-overview.md](architecture/01-system-overview.md) - Electron main/renderer/preload responsibilities, API mode, PostgreSQL mode, `media://`, and RAW/NEF preview flow.
- [architecture/02-database-design.md](architecture/02-database-design.md) - PostgreSQL/API connector modes and Firebird historical notes.
- [architecture/import-discovery-alignment.md](architecture/import-discovery-alignment.md) - gallery Import vs backend Discovery alignment.
- [architecture/backup-feature.md](architecture/backup-feature.md) - Backup/import alignment with backend.
- [technical/PIPELINE_TERMINOLOGY.md](technical/PIPELINE_TERMINOLOGY.md) - local mirror of backend stage labels and renderer constants.
- [design/FRONTEND_UX_SPEC.md](design/FRONTEND_UX_SPEC.md) - frontend visual design and UI specifications.
- [design/DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md) - local design system conventions and token mapping.

## Features

- [features/implemented/INDEX.md](features/implemented/INDEX.md) - shipped desktop feature catalog ([README](features/implemented/README.md)).
- [features/implemented/01-nef-raw-fallback.md](features/implemented/01-nef-raw-fallback.md) - RAW/NEF preview fallback.
- [features/implemented/02-desktop-shell-and-navigation.md](features/implemented/02-desktop-shell-and-navigation.md) - shell, modes, and navigation.
- [features/implemented/03-database-engine-modes.md](features/implemented/03-database-engine-modes.md) - PostgreSQL/API DB modes.
- [features/implemented/04-backend-api-jobs.md](features/implemented/04-backend-api-jobs.md) - backend job API integration.
- [features/implemented/05-jpeg-export-exif-orientation.md](features/implemented/05-jpeg-export-exif-orientation.md) - JPEG export and EXIF orientation behavior.
- [features/implemented/06-sync-from-device-workflow.md](features/implemented/06-sync-from-device-workflow.md) - device sync workflow and backend phase scheduling.
- [features/implemented/06-culling-stack-analytics.md](features/implemented/06-culling-stack-analytics.md) - culling insights sidebar and stack analytics banner.
- [features/planned/README.md](features/planned/README.md) - planned desktop work.

## Guides

- [DEVELOPMENT.md](DEVELOPMENT.md) - install, dev, doctor, typecheck, and lint commands.
- [guides/README.md](guides/README.md) - guide index.
- [guides/02-api-backend-config.md](guides/02-api-backend-config.md) - backend API URL/config behavior.
- [guides/03-testing-and-coverage.md](guides/03-testing-and-coverage.md) - Vitest and coverage notes.

## Integration

- [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md) - owner map for backend vs gallery authority.
- [integration/TODO.md](integration/TODO.md) - API/WebSocket backlog split by backend-owned contract tasks and gallery implementation tasks.
- [technical/AGENT_COORDINATION.md](technical/AGENT_COORDINATION.md) - local pointer to backend canonical coordination.
- [technical/OPENAPI_CONTRACT.md](technical/OPENAPI_CONTRACT.md) - gallery consumer checklist for backend OpenAPI sync and type generation.
- [technical/DATABASE_REFACTOR_ANALYSIS.md](technical/DATABASE_REFACTOR_ANALYSIS.md) - analysis of backend `modules/db.py` decomposition (pointer).
- [technical/EXTERNAL_CLI_REVIEWS.md](technical/EXTERNAL_CLI_REVIEWS.md) - Codex/Gemini review via subagent-orchestrator MCP.
- [api-contract/](../api-contract/) - synced API contract snapshot (`openapi.json` from backend).

## Planning

- [planning/README.md](planning/README.md) - planning index.
- [project/INDEX.md](project/INDEX.md) - project/backlog docs.
- [project/00-backlog-workflow.md](project/00-backlog-workflow.md) - backlog workflow.
- [../TODO.md](../TODO.md) - canonical repo-root task list.

## Reports

- [reports/README.md](reports/README.md) - reports index.
- [reports/05-nef-raw-fallback-incident-2026-04-19.md](reports/05-nef-raw-fallback-incident-2026-04-19.md) - NEF incident snapshot.

## Activity Log

- [log.md](log.md) - append-only documentation activity log.
- [WIKI_SCHEMA.md](WIKI_SCHEMA.md) - wiki maintenance rules.

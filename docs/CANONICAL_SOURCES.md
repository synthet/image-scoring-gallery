---
type: "Documentation"
title: "Canonical Sources"
description: "Use this map before changing integration contracts, renderer labels, database access, IPC boundaries, or RAW/export behavior."
resource: "docs/CANONICAL_SOURCES.md"
tags: ["gallery-docs"]
timestamp: 2026-06-16T00:00:00Z
---

# Canonical Sources

Use this map before changing integration contracts, renderer labels, database access, IPC boundaries, or RAW/export behavior.

## Backend-Owned Authority

| Topic | Canonical source |
|---|---|
| REST API paths, request bodies, response fields | [image-scoring-backend API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md), [openapi.yaml](https://github.com/synthet/image-scoring-backend/blob/main/docs/reference/api/openapi.yaml), [OPENAPI_CROSS_PROJECT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/OPENAPI_CROSS_PROJECT.md) |
| Synced OpenAPI snapshot (gallery, not authority) | [api-contract/openapi.json](../api-contract/openapi.json), [technical/OPENAPI_CONTRACT.md](technical/OPENAPI_CONTRACT.md) |
| Database schema and columns | [image-scoring-backend DB_SCHEMA.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/DB_SCHEMA.md), [DATABASE.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DATABASE.md), backend migrations |
| Embedding spaces (registry, default vs opt-in towers) | [image-scoring-backend EMBEDDINGS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/EMBEDDINGS.md); gallery consumer map [technical/EMBEDDING_SPACES.md](technical/EMBEDDING_SPACES.md) |
| Pipeline phase codes and user-facing terminology | [image-scoring-backend PIPELINE_TERMINOLOGY.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/PIPELINE_TERMINOLOGY.md) |
| Cross-repo change protocol | [image-scoring-backend AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md) |
| Design system (palette, icons, token package) | [image-scoring-ui DESIGN_SYSTEM.md](https://github.com/synthet/image-scoring-ui/blob/main/docs/DESIGN_SYSTEM.md), [UX_UI_CONSTITUTION.md](https://github.com/synthet/image-scoring-ui/blob/main/docs/UX_UI_CONSTITUTION.md), `@synthet/image-scoring-design` **1.2.x**; local pointers [design/DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md), [design/UX_UI_CONSTITUTION.md](design/UX_UI_CONSTITUTION.md) |
| Diagnostics, doctor, MCP triage | [image-scoring-backend DIAGNOSTICS.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DIAGNOSTICS.md), [AGENTS.md](https://github.com/synthet/image-scoring-backend/blob/main/AGENTS.md) |
| Backend shipped feature catalog | [image-scoring-backend features/implemented/INDEX.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/INDEX.md) |
| Pipeline input-size / pixel-budget research | [INPUT_SIZE_CULLING_2026-05-29.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/INPUT_SIZE_CULLING_2026-05-29.md), [UNIFIED_INPUT_POLICY_2026-05-31.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/reports/UNIFIED_INPUT_POLICY_2026-05-31.md); gallery pointer [reports/07-pipeline-input-size-study-2026-05.md](reports/07-pipeline-input-size-study-2026-05.md); backlog [backend #260](https://github.com/synthet/image-scoring-backend/issues/260), [gallery #138](https://github.com/synthet/image-scoring-gallery/issues/138) |

## Gallery-Owned Authority

| Topic | Canonical source |
|---|---|
| Electron main-process responsibilities | [electron/main.ts](../electron/main.ts) |
| Preload/contextBridge surface | [electron/preload.ts](../electron/preload.ts) |
| Main-process DB query layer | [electron/db.ts](../electron/db.ts) |
| DB provider modes (`postgres`, `api`) | [electron/db/provider.ts](../electron/db/provider.ts), [architecture/02-database-design.md](architecture/02-database-design.md) |
| Backend HTTP client behavior | [electron/apiService.ts](../electron/apiService.ts) |
| Renderer stage labels | [src/constants/pipelineLabels.ts](../src/constants/pipelineLabels.ts), [technical/PIPELINE_TERMINOLOGY.md](technical/PIPELINE_TERMINOLOGY.md) |
| Electron architecture docs | [architecture/01-system-overview.md](architecture/01-system-overview.md) |
| Shipped desktop features | [features/implemented/INDEX.md](features/implemented/INDEX.md) |
| Gallery development commands | [DEVELOPMENT.md](DEVELOPMENT.md), [../package.json](../package.json) |
| Wiki maintenance | [WIKI_SCHEMA.md](WIKI_SCHEMA.md), [log.md](log.md) |

## Rules

- Do not recommend direct renderer-process database or filesystem access. Use preload/contextBridge and main-process IPC.
- Do not invent backend endpoints, fields, database columns, phase codes, or config keys. Link to backend canonical files.
- Keep Firebird references historical only unless current code proves active support. Current gallery provider modes are normalized to PostgreSQL/API.
- Do not change EXIF orientation, NEF preview behavior, RAW handling, or JPEG export orientation without regression tests.
- For API/schema/phase terminology changes: update backend canonical docs first, then gallery code/docs, then both `docs/log.md` files.

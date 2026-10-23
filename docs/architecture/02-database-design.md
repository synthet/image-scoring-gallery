---
type: "Architecture"
title: "Database Design"
description: "PostgreSQL + pgvector is the primary database architecture. The backend owns schema and migrations; the gallery consumes that schema from the Electron main process."
resource: "docs/architecture/02-database-design.md"
tags: ["architecture", "gallery-docs"]
timestamp: 2026-06-16T00:00:00Z
---

# Database Design

PostgreSQL + pgvector is the primary database architecture. The backend owns schema and migrations; the gallery consumes that schema from the Electron main process.

## Authority

- Backend schema authority: [image-scoring-backend DB_SCHEMA.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/DB_SCHEMA.md).
- Backend database hub: [image-scoring-backend DATABASE.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/DATABASE.md).
- Cross-repo protocol: [image-scoring-backend AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md).

## Provider Modes

[electron/db/provider.ts](../../electron/db/provider.ts) creates one provider from normalized config:

| Mode | Behavior |
|---|---|
| `postgres` / `postgresql` | Uses the `pg` driver (`node-postgres`) in the Electron main process. |
| `api` | Sends database-style queries to the backend API and checks backend health through HTTP. |

The renderer never opens database connections directly. Renderer code calls preload/contextBridge functions, which invoke main-process `db:*` IPC handlers.

## API Mode

API mode is useful when the backend should own database connectivity or when direct PostgreSQL access is not available to the desktop app. The connector calls backend HTTP endpoints; exact endpoint behavior is backend-owned and must be checked against [API_CONTRACT.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/API_CONTRACT.md) and [openapi.yaml](https://github.com/synthet/image-scoring-backend/blob/main/docs/reference/api/openapi.yaml).

## Legacy Firebird

Firebird is historical for this gallery. Existing config normalization may handle legacy `firebird` values, but [electron/db/provider.ts](../../electron/db/provider.ts) accepts normalized supported engines and rejects unsupported raw engines. Do not document Firebird as an active primary path unless current code changes prove it.

Historical context:

- [planning/02-firebird-postgresql-migration.md](../planning/02-firebird-postgresql-migration.md)
- Backend [FIREBIRD_POSTGRES_MIGRATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/planning/database/FIREBIRD_POSTGRES_MIGRATION.md)

## Change Discipline

For schema changes:

1. Update backend migration/initializer and backend canonical docs first.
2. Update gallery SQL/query code in [electron/db.ts](../../electron/db.ts) or provider behavior as needed.
3. Update gallery docs and append [../log.md](../log.md).
4. Run backend and gallery checks listed in the handoff.

## Normalized bird-box compatibility reads

The optional `localization.read_normalized_first` setting defaults to `false`.
When enabled, all image/detail/stack/sub-stack SQL projections use the backend-owned
`image_bird_bbox_compat` view (migration **0043**). Both PostgreSQL and API-SQL modes
use the same view; the direct PostgreSQL mode gains no WebUI dependency. The view
prefers active production selection projections, then imported legacy outcomes,
and retains the legacy value for unselected native shadow results or absent artifacts.

Deploy migration 0043 before enabling this gallery setting. Keep it disabled until
the localization quality and compatibility gates pass. Gallery loads configuration
at startup: restart Gallery after changing the setting. Rollback sets it to `false`
and restarts Gallery, returning to the legacy column without detection or data writes.
The backend API has its own existing setting of the same name; plan and observe both
consumer switches explicitly. This adds no renderer field or IPC payload change.

This is compatibility groundwork, not retirement of the legacy column or proof that
the required full-release compatibility period has completed. The backend is the
schema authority: see its
[compatibility contract](https://github.com/synthet/image-scoring-pipeline/blob/main/docs/technical/NORMALIZED_BBOX_COMPATIBILITY.md).

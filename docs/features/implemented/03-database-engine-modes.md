---
type: "Implemented Feature"
title: "Database engine modes"
description: "Purpose: Query and update library metadata either directly against PostgreSQL (database.engine: \"pg\") or via the backend’s SQL-over-HTTP bridge (database.engine: \"api\"), using one "
resource: "docs/features/implemented/03-database-engine-modes.md"
tags: ["features", "gallery-docs", "implemented"]
timestamp: 2026-06-30T00:00:00Z
---

# Database engine modes

**Purpose:** Query and update library metadata either **directly against PostgreSQL** (`database.engine: "pg"`) or via the backend’s **SQL-over-HTTP** bridge (`database.engine: "api"`), using one abstraction in the renderer.

**User-visible behavior:** Same UI for browsing stacks, folders, and images; connection errors if Docker/Postgres or the WebUI URL is wrong; config changes require restart per project conventions.

**Primary code paths:** `electron/db.ts`, `electron/db/provider.ts`, IPC channels `db:*` in `electron/main.ts` (e.g. `db:get-images`, `db:get-folders`, `db:get-stacks`, `db:update-image-details`, `db:delete-image`, `import:run`, `sync:*`, `backup:*`). After delete, the renderer prunes the active grid list optimistically — see [07-grid-delete-state-sync.md](07-grid-delete-state-sync.md).

**HTTP bridge:** When engine is `api`, parameterized SQL hits **`POST /api/db/query`** on the resolved base URL — see backend [09-configuration-and-limits.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/features/implemented/09-configuration-and-limits.md) and backend `config` keys `database.enable_api_db_query`, row caps, and write gating.

**Related docs:** [02-database-design.md](../../architecture/02-database-design.md) · [DATABASE_REFACTOR_ANALYSIS.md](../../technical/DATABASE_REFACTOR_ANALYSIS.md) · [07-grid-delete-state-sync.md](07-grid-delete-state-sync.md) · Backend [AGENT_COORDINATION.md](https://github.com/synthet/image-scoring-backend/blob/main/docs/technical/AGENT_COORDINATION.md)

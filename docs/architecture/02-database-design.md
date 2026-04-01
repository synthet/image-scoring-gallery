# Database Engine — Decision Record

Date: 2026-03-07 (original), updated 2026-03-30
Status: **Completed — migrated to PostgreSQL + pgvector**

## Question

Current DB engine was Firebird. Is there a better DB for this project?

## Decision

Migrate to **PostgreSQL + pgvector** as a coordinated platform move across both the Python backend (`image-scoring-backend`) and this Electron gallery.

## What was done

1. **Backend (Phase 3)**: Python scoring pipeline switched to PostgreSQL. All ~60 DB functions route to PG. SQL auto-translation layer handles legacy Firebird syntax.
2. **Electron (Phase 4)**: `electron/db/provider.ts` provides a connector abstraction. `node-firebird` dependency removed; `pg` is the production driver. Legacy `engine: "firebird"` config values automatically map to the Postgres connector.
3. **Data migration**: Bulk migration script (`scripts/python/migrate_firebird_to_postgres.py`) migrated all data including embeddings (Firebird BLOB → `vector(1280)` with HNSW cosine index).

## Current stack

- **Database**: PostgreSQL 17 + pgvector, running in Docker (`docker-compose.yml` in backend repo)
- **Electron driver**: `pg` (node-postgres) via pool in `electron/db/provider.ts`
- **Backend driver**: psycopg2 via `ThreadedConnectionPool` in `modules/db_postgres.py`

## Historical context

The original recommendation (March 2026) was to stay on Firebird and improve the client layer first. The migration to PostgreSQL was completed later that month as a coordinated cross-project effort. See [migration plan](../planning/02-firebird-postgresql-migration.md) for full details.

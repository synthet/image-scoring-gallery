---
name: firebird-db
description: "[DEPRECATED] Legacy Firebird database skill — the project has migrated to PostgreSQL + pgvector. See electron/db/provider.ts for the current DB abstraction."
---

# Database & Scoring Schema (PostgreSQL)

> [!CAUTION]
> This skill was originally written for Firebird. The project migrated to **PostgreSQL + pgvector** in March 2026. The schema and query patterns below have been updated for the current stack. See [02-database-design.md](../../docs/architecture/02-database-design.md) for the migration decision record.

## Connection

The app connects to PostgreSQL via `pg` (node-postgres). Configuration is in `config.json`:

```json
{
    "database": {
        "engine": "postgres",
        "postgres": {
            "host": "127.0.0.1",
            "port": 5432,
            "database": "image_scoring",
            "user": "postgres",
            "password": "postgres"
        }
    }
}
```

> [!IMPORTANT]
> PostgreSQL runs in Docker. Start it with `docker compose -f docker-compose.yml up -d` in the `image-scoring-backend` project.

## Database Schema

The primary table is `images` with these key columns:

### Identity & Metadata
| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `file_path` | TEXT | Full file path (WSL format: `/mnt/d/...`) |
| `file_name` | TEXT | Filename only |
| `folder_id` | INTEGER | FK to folders |
| `thumbnail_path` | TEXT | Path to thumbnail |
| `created_at` | TIMESTAMP | When record was added |

### Scoring Columns (normalized 0.0–1.0)
| Column | Model | Weight in Formulas |
|--------|-------|-------------------|
| `score_liqe` | LIQE | Primary in General & Aesthetic |
| `score_ava` | AVA | Primary in General & Aesthetic |
| `score_spaq` | SPAQ | Primary in General & Technical |
| `score_koniq` | KoNIQ (legacy) | Deprecated |
| `score_paq2piq` | PaQ2PiQ (legacy) | Deprecated |

### Composite Scores (normalized 0.0–1.0)
| Column | Formula |
|--------|---------|
| `score_general` | Weighted blend of LIQE + AVA + SPAQ |
| `score_technical` | Primarily SPAQ-based |
| `score_aesthetic` | Primarily LIQE + AVA based |

### Classification
| Column | Type | Values |
|--------|------|--------|
| `rating` | INTEGER | 0–5 stars |
| `label` | TEXT | `Red`, `Yellow`, `Green`, `Blue`, `Purple`, or NULL |
| `keywords` | TEXT | Comma-separated tags |
| `title` | TEXT | Optional title |
| `description` | TEXT | Optional description |

### Stacks
| Column | Type | Description |
|--------|------|-------------|
| `stack_id` | INTEGER | Stack group ID |
| `stack_key` | INTEGER | Stack group key |

### Embeddings
| Column | Type | Description |
|--------|------|-------------|
| `image_embedding` | vector(1280) | MUSIQ embedding via pgvector |

## Query Patterns

All DB operations are in `electron/db.ts`. The core helper uses the connector abstraction:

```typescript
export async function query<T = unknown>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    return connector.query<T>(sql, params);
}
```

The `electron/db/provider.ts` `PostgresConnector` automatically translates `?` placeholders to `$1`, `$2`, etc. for node-pg. SQL should use PostgreSQL syntax (LIMIT/OFFSET, not FIRST/SKIP).

### Filtering Pattern (used by `getImages`, `getImageCount`)

```typescript
const conditions: string[] = [];
const params: any[] = [];

if (options.folderId) {
    conditions.push('folder_id = ?');
    params.push(options.folderId);
}
if (options.minRating) {
    conditions.push('rating >= ?');
    params.push(options.minRating);
}
const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
```

## Available Functions

| Function | Purpose |
|----------|---------|
| `getImages(options)` | Paginated image list with filtering/sorting |
| `getImageCount(options)` | Count matching current filters |
| `getImageDetails(id)` | Full record for one image |
| `updateImageDetails(id, updates)` | Update rating, label, title, etc. |
| `deleteImage(id)` | Remove DB record (not file) |
| `getFolders()` | Folder tree from DB |
| `getKeywords()` | Distinct keyword list |
| `getStacks(options)` | Paginated stack list |
| `getImagesByStack(stackId, options)` | Images within a stack |
| `getStackCount(options)` | Count of stacks |

## Relationship to image-scoring-backend Project

The PostgreSQL database is **owned by** the Python **image-scoring-backend** project (your local clone). That project:
- Runs neural network models (MUSIQ family, LIQE) on images
- Writes raw scores to the database
- Manages the PostgreSQL Docker container
- Provides the migration scripts and Alembic versioned schema

This Electron app is a **read-heavy** frontend that queries the same database. Write operations are limited to metadata edits (rating, label, title, description) and record deletion.

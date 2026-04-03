# Database Connection Abstraction Layer

> **Status (2026-04):** Implemented in **`electron/db/provider.ts`**. Firebird and `node-firebird` have been **removed** from the Electron app; production uses **`PostgresConnector`** (`pg`) or **`ApiConnector`** (HTTP SQL to the backend). This note is kept for historical context; see [02-database-design.md](../architecture/02-database-design.md) and [02-firebird-postgresql-migration.md](02-firebird-postgresql-migration.md).

The connection layer provides multiple implementations behind one interface:

1. **PostgresConnector** — Direct PostgreSQL via `pg` pool.
2. **ApiConnector** — Database requests proxied to the Python backend (`POST /api/db/query`).

## Architecture

The system uses `IDatabaseConnector` to unify database access.

```typescript
export interface IDatabaseConnector {
    readonly type: 'postgres' | 'api';
    connect(): Promise<unknown>;
    close(): Promise<void>;
    query<T = unknown>(sql: string, params?: QueryParam[]): Promise<T[]>;
    runTransaction<T>(callback: (txQuery: TxQuery) => Promise<T>): Promise<T>;
    checkConnection(): Promise<boolean>;
    verifyStartup(): Promise<boolean>;
}
```

### Implementations

- **PostgresConnector**: Wraps `pg` pool; `?`-style placeholders are translated for PostgreSQL.
- **ApiConnector**: Sends SQL queries to the Python backend via HTTP POST `/api/db/query`.

## Configuration

The `config.json` file should specify the `database.engine`:

```json
{
  "database": {
    "engine": "api",
    "api": {
      "url": "http://localhost:7860"
    }
  }
}
```

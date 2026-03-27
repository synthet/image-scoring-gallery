# Database Connection Abstraction Layer

The goal is to create a robust database connection abstraction layer with multiple implementations:
1.  **FirebirdConnector**: Direct connection to Firebird (existing logic).
2.  **PostgresConnector**: Direct connection to PostgreSQL (existing logic).
3.  **ApiConnector**: Redirects database requests to a remote Python backend (new).

## Architecture

The system uses an interface `IDatabaseConnector` to unify different database access methods.

```typescript
export interface IDatabaseConnector {
    readonly type: 'firebird' | 'postgres' | 'api';
    connect(): Promise<unknown>;
    close(): Promise<void>;
    query<T = unknown>(sql: string, params?: QueryParam[]): Promise<T[]>;
    runTransaction<T>(callback: (txQuery: TxQuery) => Promise<T>): Promise<T>;
    checkConnection(): Promise<boolean>;
    verifyStartup(): Promise<boolean>;
}
```

### Implementations

- **FirebirdConnector**: Wraps `node-firebird`.
- **PostgresConnector**: Wraps `pg` pool.
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

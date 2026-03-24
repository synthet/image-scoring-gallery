import fs from 'fs';
import path from 'path';
import type {
    AppConfig,
    DatabaseEngine,
    PostgresPoolConfig,
    PostgresSslConfig,
    PostgresConfig,
} from './types';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toEngine(value: unknown): DatabaseEngine {
    return value === 'postgres' ? 'postgres' : 'firebird';
}

function normalizePostgresSsl(value: unknown): boolean | PostgresSslConfig | undefined {
    if (typeof value === 'boolean') return value;
    if (!isRecord(value)) return undefined;

    const out: PostgresSslConfig = {};
    if (typeof value.enabled === 'boolean') out.enabled = value.enabled;
    if (typeof value.rejectUnauthorized === 'boolean') out.rejectUnauthorized = value.rejectUnauthorized;
    if (typeof value.ca === 'string') out.ca = value.ca;
    if (typeof value.cert === 'string') out.cert = value.cert;
    if (typeof value.key === 'string') out.key = value.key;
    return out;
}

function normalizePostgresPool(value: unknown): PostgresPoolConfig | undefined {
    if (!isRecord(value)) return undefined;
    const out: PostgresPoolConfig = {};
    const min = asNumber(value.min);
    const max = asNumber(value.max);
    const idleTimeoutMillis = asNumber(value.idleTimeoutMillis);
    const connectionTimeoutMillis = asNumber(value.connectionTimeoutMillis);
    if (min !== undefined) out.min = min;
    if (max !== undefined) out.max = max;
    if (idleTimeoutMillis !== undefined) out.idleTimeoutMillis = idleTimeoutMillis;
    if (connectionTimeoutMillis !== undefined) out.connectionTimeoutMillis = connectionTimeoutMillis;
    return out;
}

export function validatePostgresConfig(databaseConfig: JsonRecord): PostgresConfig {
    const postgres = isRecord(databaseConfig.postgres) ? databaseConfig.postgres : null;
    if (!postgres) {
        throw new Error('database.postgres is required when database.engine is "postgres".');
    }

    const host = asString(postgres.host);
    const port = asNumber(postgres.port);
    const database = asString(postgres.database);
    const user = asString(postgres.user);
    const password = asString(postgres.password);

    if (!host) throw new Error('database.postgres.host is required.');
    if (!port || port <= 0) throw new Error('database.postgres.port must be a positive number.');
    if (!database) throw new Error('database.postgres.database is required.');
    if (!user) throw new Error('database.postgres.user is required.');
    if (!password) throw new Error('database.postgres.password is required.');

    return {
        host,
        port,
        database,
        user,
        password,
        ssl: normalizePostgresSsl(postgres.ssl),
        pool: normalizePostgresPool(postgres.pool),
    };
}

export function normalizeAppConfig(rawConfig: unknown): AppConfig {
    const cfg = isRecord(rawConfig) ? { ...rawConfig } : {};
    const rawDatabase = isRecord(cfg.database) ? { ...cfg.database } : {};
    const engine = toEngine(rawDatabase.engine);

    const normalizedDatabase: AppConfig['database'] = {
        ...rawDatabase,
        engine,
    };

    if (engine === 'firebird') {
        normalizedDatabase.host = asString(rawDatabase.host) || '127.0.0.1';
        normalizedDatabase.port = asNumber(rawDatabase.port) || 3050;
        normalizedDatabase.user = asString(rawDatabase.user) || 'sysdba';
        normalizedDatabase.password = asString(rawDatabase.password) || 'masterkey';
        normalizedDatabase.path = asString(rawDatabase.path) || rawDatabase.path as string | undefined;
    } else {
        normalizedDatabase.postgres = validatePostgresConfig(rawDatabase);
    }

    return {
        ...cfg,
        database: normalizedDatabase,
    };
}

export function loadAppConfig(configPath: string): AppConfig {
    try {
        if (fs.existsSync(configPath)) {
            const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return normalizeAppConfig(parsed);
        }
    } catch (e) {
        console.error('Failed to load config.json:', e);
    }
    return normalizeAppConfig({});
}

export function getConfigPath(fromDirname: string): string {
    return path.resolve(path.join(fromDirname, '../config.json'));
}

export function deepMergeConfig<T extends JsonRecord>(target: T, source: JsonRecord): T {
    const out = { ...target } as JsonRecord;
    for (const [key, value] of Object.entries(source)) {
        if (isRecord(value) && isRecord(out[key])) {
            out[key] = deepMergeConfig(out[key] as JsonRecord, value);
        } else {
            out[key] = value;
        }
    }
    return out as T;
}

import fs from 'fs';
import path from 'path';
import type {
    AppConfig,
    NormalizedAppConfig,
    DatabaseEngine,
    PostgresDatabaseConfig,
    PostgresPoolConfig,
    PostgresSslConfig,
    PostgresConfig,
    ApiDatabaseConfig,
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
    return value === 'api' ? 'api' : 'postgres';
}

function getEngineFromDatabaseConfig(rawDatabase: JsonRecord): DatabaseEngine {
    return toEngine(rawDatabase.engine ?? rawDatabase.provider);
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
    const postgres = isRecord(databaseConfig.postgres) ? databaseConfig.postgres : {};

    const host = asString(postgres.host) || 'localhost';
    const port = asNumber(postgres.port) || 5432;
    const database = asString(postgres.database) || 'image_scoring';
    const user = asString(postgres.user) || 'postgres';
    const password = asString(postgres.password) || 'postgres';

    const normalized: PostgresConfig = {
        host,
        port,
        database,
        user,
        password,
        ssl: normalizePostgresSsl(postgres.ssl),
        pool: normalizePostgresPool(postgres.pool),
    };
    return normalized;
}

export function normalizeAppConfig(rawConfig: unknown): NormalizedAppConfig {
    const cfg = isRecord(rawConfig) ? { ...rawConfig } : {};
    const rawDatabase = isRecord(cfg.database) ? { ...cfg.database } : {};
    const engine = getEngineFromDatabaseConfig(rawDatabase);

    if (engine === 'api') {
        const apiConfigRaw = isRecord(rawDatabase.api) ? rawDatabase.api : {};
        const normalizedDatabase: ApiDatabaseConfig = {
            engine: 'api',
            provider: 'api',
            api: {
                url: asString(apiConfigRaw.url),
                timeout: asNumber(apiConfigRaw.timeout),
                dialect: 'postgres',
                sqlDialect: 'postgres',
            }
        };
        return {
            ...cfg,
            database: normalizedDatabase,
        };
    } else {
        const normalizedDatabase: PostgresDatabaseConfig = {
            engine: 'postgres',
            provider: 'postgres',
            postgres: validatePostgresConfig(rawDatabase),
        };
        return {
            ...cfg,
            database: normalizedDatabase,
        };
    }
}

export function getEnvironmentPath(fromDirname: string): string {
    return path.resolve(path.join(fromDirname, '../environment.json'));
}

export function loadAppConfig(configPath: string): NormalizedAppConfig {
    try {
        const baseRaw = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
            : {};
        const base: JsonRecord = isRecord(baseRaw) ? baseRaw : {};
        const envPath = path.resolve(path.dirname(configPath), 'environment.json');
        const envRaw = fs.existsSync(envPath)
            ? JSON.parse(fs.readFileSync(envPath, 'utf8'))
            : {};
        const env: JsonRecord = isRecord(envRaw) ? envRaw : {};
        const merged = deepMergeConfig(base, env);
        return normalizeAppConfig(merged);
    } catch (e) {
        console.error('Failed to load config.json / environment.json:', e);
    }
    return normalizeAppConfig({});
}

export function getConfigPath(fromDirname: string): string {
    return path.resolve(path.join(fromDirname, '../config.json'));
}

export function deepMergeConfig<T extends JsonRecord>(target: T, source: JsonRecord): T {
    // Arrays are intentionally replaced as atomic values rather than merged index-by-index.
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

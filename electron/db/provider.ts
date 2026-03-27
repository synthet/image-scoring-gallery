import Firebird from 'node-firebird';
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import type { ApiDatabaseConfig, DatabaseConfig, PostgresConfig as AppPostgresConfig } from '../types';

export type QueryParam = string | number | null;
export type TxQuery = <R = unknown>(sql: string, params?: QueryParam[]) => Promise<R[]>;

export interface IDatabaseConnector {
    readonly type: 'firebird' | 'postgres' | 'api';
    connect(): Promise<unknown>;
    close(): Promise<void>;
    query<T = unknown>(sql: string, params?: QueryParam[]): Promise<T[]>;
    runTransaction<T>(callback: (txQuery: TxQuery) => Promise<T>): Promise<T>;
    checkConnection(): Promise<boolean>;
    verifyStartup(): Promise<boolean>;
}

interface FirebirdRuntimeConfig {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    path?: string;
}

interface FirebirdBootConfig {
    path?: string;
}

export class FirebirdConnector implements IDatabaseConnector {
    readonly type = 'firebird' as const;

    private readonly options: Firebird.Options;
    private readonly firebirdConfig: FirebirdBootConfig;
    private persistentConnection: Firebird.Database | null = null;
    private connectionPromise: Promise<Firebird.Database> | null = null;
    private queryChain: Promise<unknown> = Promise.resolve();

    constructor(dbConfig: FirebirdRuntimeConfig, databasePath: string, firebirdConfig: FirebirdBootConfig = {}) {
        this.options = {
            host: dbConfig.host || '127.0.0.1',
            port: dbConfig.port || 3050,
            database: databasePath,
            user: dbConfig.user || 'sysdba',
            password: dbConfig.password || 'masterkey',
            lowercase_keys: true,
            role: '',
            pageSize: 4096,
        };
        this.firebirdConfig = firebirdConfig;
    }

    async connect(): Promise<Firebird.Database> {
        return this.getConnection();
    }

    async close(): Promise<void> {
        if (!this.persistentConnection) return;

        const db = this.persistentConnection;
        this.persistentConnection = null;

        await new Promise<void>((resolve) => {
            db.detach((err) => {
                if (err) {
                    console.error('[DB] Error closing Firebird connection:', err);
                } else {
                    console.log('[DB] Firebird connection closed');
                }
                resolve();
            });
        });
    }

    async query<T = unknown>(sql: string, params: QueryParam[] = []): Promise<T[]> {
        const run = () => this.executeQuery<T>(sql, params);

        const p = this.queryChain.then(run, run);
        this.queryChain = p.then(
            () => undefined,
            () => undefined,
        );

        return p;
    }

    async checkConnection(): Promise<boolean> {
        try {
            await this.query('SELECT 1 FROM RDB$DATABASE');
            return true;
        } catch (e) {
            console.error('[DB] Firebird check connection failed:', e);
            return false;
        }
    }

    async verifyStartup(): Promise<boolean> {
        const port = this.options.port || 3050;
        const host = this.options.host || '127.0.0.1';

        console.log(`[DB] Checking if Firebird is running on ${host}:${port}...`);
        const isOpen = await this.isPortOpen(port, host);

        if (isOpen) {
            console.log('[DB] Firebird is already running.');
            return true;
        }

        console.log('[DB] Firebird port is closed. Attempting to start server...');
        const firebirdPath = this.firebirdConfig.path;

        if (!firebirdPath) {
            console.error('[DB] Firebird path not configured in config.json (firebird.path). Cannot auto-start.');
            return false;
        }

        const binPath = path.join(firebirdPath, 'firebird.exe');

        if (!fs.existsSync(binPath)) {
            console.error(`[DB] Firebird executable not found at: ${binPath}`);
            return false;
        }

        return new Promise((resolve) => {
            console.log(`[DB] Spawning Firebird process: ${binPath} -a -p ${port}`);
            const child = spawn(binPath, ['-a', '-p', String(port)], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
            });
            child.unref();

            console.log('[DB] Waiting for Firebird to be ready...');
            let attempts = 0;
            const maxAttempts = 20;

            const checkInterval = setInterval(async () => {
                attempts++;
                const ready = await this.isPortOpen(port, host);
                if (ready) {
                    clearInterval(checkInterval);
                    console.log('[DB] Firebird started successfully!');
                    resolve(true);
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    console.error('[DB] Timeout waiting for Firebird to start.');
                    resolve(false);
                }
            }, 500);
        });
    }

    async runTransaction<T>(callback: (txQuery: TxQuery) => Promise<T>): Promise<T> {
        const db = await this.getConnection();
        const isolation = Firebird.ISOLATION_READ_COMMITTED;

        return new Promise((resolve, reject) => {
            db.transaction(isolation, async (err, transaction) => {
                if (err) {
                    this.persistentConnection = null;
                    return reject(err);
                }

                const txQuery: TxQuery = <R = unknown>(sql: string, params: QueryParam[] = []): Promise<R[]> => {
                    return new Promise((qResolve, qReject) => {
                        transaction.query(sql, params, (qErr, result) => {
                            if (qErr) return qReject(qErr);
                            qResolve(result as R[]);
                        });
                    });
                };

                try {
                    const result = await callback(txQuery);
                    transaction.commit((commitErr) => {
                        if (commitErr) {
                            this.persistentConnection = null;
                            return reject(commitErr);
                        }
                        resolve(result);
                    });
                } catch (cbErr) {
                    transaction.rollback((rollbackErr) => {
                        if (rollbackErr) console.error('[DB] Firebird rollback error:', rollbackErr);
                        reject(cbErr);
                    });
                }
            });
        });
    }

    private async executeQuery<T = unknown>(sql: string, params: QueryParam[] = []): Promise<T[]> {
        const db = await this.getConnection();

        return new Promise<T[]>((resolve, reject) => {
            db.query(sql, params, (err, result) => {
                if (err) {
                    this.persistentConnection = null;
                    return reject(err);
                }
                resolve(result as T[]);
            });
        });
    }

    private async getConnection(): Promise<Firebird.Database> {
        if (this.persistentConnection) {
            return this.persistentConnection;
        }

        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        const CONNECTION_TIMEOUT_MS = 10000;

        this.connectionPromise = new Promise<Firebird.Database>((resolve, reject) => {
            const port = this.options.port || 3050;
            const host = this.options.host || '127.0.0.1';

            console.log(`[DB] Attempting persistent Firebird connection to ${host}:${port}...`);

            const timeout = setTimeout(() => {
                this.connectionPromise = null;
                this.persistentConnection = null;
                reject(new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS / 1000}s — is Firebird running on ${host}:${port}?`));
            }, CONNECTION_TIMEOUT_MS);

            Firebird.attach(this.options, (err, db) => {
                clearTimeout(timeout);
                this.connectionPromise = null;

                if (err) {
                    console.error('[DB] Failed to establish persistent Firebird connection:', err);
                    this.persistentConnection = null;
                    return reject(err);
                }

                console.log('[DB] Persistent Firebird connection established');
                this.persistentConnection = db;
                resolve(db);
            });
        });

        return this.connectionPromise;
    }

    private async isPortOpen(port: number, host: string = '127.0.0.1'): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(port, host);
        });
    }
}

interface PgPoolDriverConfig {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    ssl?: boolean | Record<string, unknown>;
}

function normalizeSslForPg(ssl: AppPostgresConfig['ssl']): boolean | Record<string, unknown> | undefined {
    if (ssl === undefined) return undefined;
    if (typeof ssl === 'boolean') return ssl;
    if (typeof ssl === 'object' && ssl !== null) {
        if (ssl.enabled === false) return false;
        const out: Record<string, unknown> = {};
        if (ssl.rejectUnauthorized !== undefined) out.rejectUnauthorized = ssl.rejectUnauthorized;
        if (ssl.ca) out.ca = ssl.ca;
        if (ssl.cert) out.cert = ssl.cert;
        if (ssl.key) out.key = ssl.key;
        return Object.keys(out).length > 0 ? out : true;
    }
    return undefined;
}

/**
 * Firebird-style `?` placeholders → `$1`..`$n` for node-pg (outside string literals; `''` = escaped quote).
 */
export function sqlQuestionMarksToPgNumbered(sql: string): { text: string; count: number } {
    let out = '';
    let i = 0;
    let n = 0;
    let inString = false;
    while (i < sql.length) {
        const c = sql[i];
        if (c === "'") {
            if (inString && sql[i + 1] === "'") {
                out += "''";
                i += 2;
                continue;
            }
            inString = !inString;
            out += c;
            i++;
            continue;
        }
        if (!inString && c === '?') {
            n += 1;
            out += `$${n}`;
        } else {
            out += c;
        }
        i++;
    }
    return { text: out, count: n };
}

function appPostgresConfigToPoolOptions(pg: AppPostgresConfig): PgPoolDriverConfig {
    const pool = pg.pool || {};
    return {
        host: pg.host,
        port: pg.port,
        user: pg.user,
        password: pg.password,
        database: pg.database,
        min: pool.min,
        max: pool.max,
        idleTimeoutMillis: pool.idleTimeoutMillis,
        connectionTimeoutMillis: pool.connectionTimeoutMillis,
        ssl: normalizeSslForPg(pg.ssl),
    };
}

type PgRow = Record<string, unknown>;

interface PgPoolLike {
    query<T extends PgRow = PgRow>(sql: string, params?: QueryParam[]): Promise<{ rows: T[] }>;
    connect(): Promise<PgPoolClientLike>;
    end(): Promise<void>;
}

interface PgPoolClientLike {
    query<T extends PgRow = PgRow>(sql: string, params?: QueryParam[]): Promise<{ rows: T[] }>;
    release(): void;
}

interface PgModuleLike {
    Pool: new (config: PgPoolDriverConfig) => PgPoolLike;
}

const runtimeImport = new Function('moduleName', 'return import(moduleName)') as (moduleName: string) => Promise<unknown>;

export class PostgresConnector implements IDatabaseConnector {
    readonly type = 'postgres' as const;

    private readonly poolConfig: PgPoolDriverConfig;
    private pool: PgPoolLike | null = null;
    private poolPromise: Promise<PgPoolLike> | null = null;

    constructor(poolConfig: PgPoolDriverConfig = {}) {
        this.poolConfig = poolConfig;
    }

    async connect(): Promise<PgPoolLike> {
        return this.getPool();
    }

    async close(): Promise<void> {
        if (!this.pool) return;
        await this.pool.end();
        this.pool = null;
    }

    async query<T = unknown>(sql: string, params: QueryParam[] = []): Promise<T[]> {
        const pool = await this.getPool();
        const { text, count } = sqlQuestionMarksToPgNumbered(sql);
        if (count !== params.length) {
            throw new Error(
                `[DB] Postgres: ${count} placeholders vs ${params.length} params`
            );
        }
        const result = await pool.query<T & PgRow>(text, params);
        return result.rows as T[];
    }

    async runTransaction<T>(callback: (txQuery: TxQuery) => Promise<T>): Promise<T> {
        const pool = await this.getPool();
        const client = await pool.connect();

        const txQuery: TxQuery = async <R = unknown>(sql: string, params: QueryParam[] = []): Promise<R[]> => {
            const { text, count } = sqlQuestionMarksToPgNumbered(sql);
            if (count !== params.length) {
                throw new Error(
                    `[DB] Postgres tx: ${count} placeholders vs ${params.length} params`
                );
            }
            const result = await client.query<R & PgRow>(text, params);
            return result.rows as R[];
        };

        try {
            await client.query('BEGIN');
            const result = await callback(txQuery);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async checkConnection(): Promise<boolean> {
        try {
            await this.query('SELECT 1');
            return true;
        } catch (e) {
            console.error('[DB] Postgres check connection failed:', e);
            return false;
        }
    }

    async verifyStartup(): Promise<boolean> {
        return this.checkConnection();
    }

    private async getPool(): Promise<PgPoolLike> {
        if (this.pool) {
            return this.pool;
        }

        if (this.poolPromise) {
            return this.poolPromise;
        }

        this.poolPromise = (async () => {
            try {
                const pg = (await runtimeImport('pg')) as PgModuleLike;
                this.pool = new pg.Pool({
                    host: this.poolConfig.host || '127.0.0.1',
                    port: this.poolConfig.port || 5432,
                    user: this.poolConfig.user,
                    password: this.poolConfig.password,
                    database: this.poolConfig.database,
                    min: this.poolConfig.min,
                    max: this.poolConfig.max,
                    idleTimeoutMillis: this.poolConfig.idleTimeoutMillis,
                    connectionTimeoutMillis: this.poolConfig.connectionTimeoutMillis,
                    ssl: this.poolConfig.ssl,
                });
                return this.pool;
            } catch (error) {
                const cause = error instanceof Error ? error.message : String(error);
                throw new Error(`[DB] Failed to load "pg". Install it with "npm i pg" to use Postgres provider. Cause: ${cause}`);
            } finally {
                this.poolPromise = null;
            }
        })();

        return this.poolPromise;
    }
}

export class ApiConnector implements IDatabaseConnector {
    readonly type = 'api' as const;

    private readonly apiUrl: string;
    private readonly timeout: number;

    constructor(apiUrl: string, timeout: number = 10000) {
        this.apiUrl = apiUrl.replace(/\/$/, '');
        this.timeout = timeout;
    }

    async connect(): Promise<void> {
        // No persistent connection needed for stateless API
        return Promise.resolve();
    }

    async close(): Promise<void> {
        return Promise.resolve();
    }

    async query<T = unknown>(sql: string, params: QueryParam[] = []): Promise<T[]> {
        const response = await fetch(`${this.apiUrl}/api/db/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, params }),
            signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API Query failed (${response.status}): ${text}`);
        }

        const raw = (await response.json()) as unknown;
        if (Array.isArray(raw)) {
            return raw as T[];
        }
        if (raw && typeof raw === 'object') {
            const o = raw as Record<string, unknown>;
            if (Array.isArray(o.data)) {
                return o.data as T[];
            }
            if (Array.isArray(o.rows)) {
                return o.rows as T[];
            }
        }
        throw new Error('[DB] ApiConnector: expected JSON { data: rows[] }, { rows: [] }, or a row array');
    }

    /**
     * Runs sequential HTTP queries — **not** a single ACID transaction (no shared backend session).
     */
    async runTransaction<T>(callback: (txQuery: TxQuery) => Promise<T>): Promise<T> {
        const txQuery: TxQuery = <R = unknown>(sql: string, params: QueryParam[] = []): Promise<R[]> => {
            return this.query<R>(sql, params);
        };

        try {
            return await callback(txQuery);
        } catch (e) {
            console.error('[DB] ApiConnector transaction sequence failed:', e);
            throw e;
        }
    }

    async checkConnection(): Promise<boolean> {
        try {
            const response = await fetch(`${this.apiUrl}/api/health`, {
                signal: AbortSignal.timeout(2000)
            });
            return response.ok;
        } catch (e) {
            console.error('[DB] ApiConnector health check failed:', e);
            return false;
        }
    }

    async verifyStartup(): Promise<boolean> {
        return this.checkConnection();
    }
}

export function createDatabaseConnector(config: {
    dbConfig: DatabaseConfig;
    firebirdConfig?: FirebirdBootConfig;
    firebirdDatabasePath: string;
}): IDatabaseConnector {
    const kind = (config.dbConfig.engine || config.dbConfig.provider || 'firebird').toLowerCase();

    if (kind === 'api') {
        const apiCfg = (config.dbConfig as ApiDatabaseConfig).api || {};
        const url = apiCfg.url || 'http://localhost:7860';
        const timeout = apiCfg.timeout ?? 10000;
        console.log(`[DB] Using API connector at ${url}`);
        return new ApiConnector(url, timeout);
    }

    if (kind === 'postgres' || kind === 'postgresql') {
        const pgCfg = 'postgres' in config.dbConfig ? config.dbConfig.postgres : undefined;
        if (!pgCfg) {
            throw new Error('[DB] database.postgres config is required when engine/provider is "postgres".');
        }
        console.log('[DB] Using Postgres connector');
        return new PostgresConnector(appPostgresConfigToPoolOptions(pgCfg));
    }

    console.log('[DB] Using Firebird connector');
    return new FirebirdConnector(
        config.dbConfig as FirebirdRuntimeConfig,
        config.firebirdDatabasePath,
        config.firebirdConfig,
    );
}

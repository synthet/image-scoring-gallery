import Firebird from 'node-firebird';
import path from 'path';
import fs from 'fs';

import { spawn } from 'child_process';
import net from 'net';

// Load configuration
function loadConfig() {
    const configPath = path.resolve(path.join(__dirname, '../config.json'));
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load config.json:', e);
    }
    return {};
}

const config = loadConfig();
const dbConfig = config.database || {};

// Add test detection — tests must NEVER use production DB
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;

// Database options
// If path is relative in config, it's relative to the project root (one level up from dist-electron)
let rawDbPath: string;

if (isTestEnv) {
    // Force test DB only — matches image-scoring/scripts/setup_test_db.py (scoring_history_test.fdb)
    rawDbPath = '../image-scoring/scoring_history_test.fdb';
    console.warn('[DB] Test environment detected! Using test DB only: scoring_history_test.fdb');
} else {
    rawDbPath = dbConfig.path || '../image-scoring/SCORING_HISTORY.FDB';
}

const dbPath = path.isAbsolute(rawDbPath)
    ? rawDbPath
    : path.resolve(path.join(__dirname, '..', rawDbPath));

console.log('Connecting to DB at:', dbPath);

const options: Firebird.Options = {
    host: dbConfig.host || '127.0.0.1',
    port: dbConfig.port || 3050,
    database: dbPath,
    user: dbConfig.user || 'sysdba',
    password: dbConfig.password || 'masterkey',
    lowercase_keys: true,
    role: '',
    pageSize: 4096
};

// Also support connecting to the file directly if we used Embedded, 
// but node-firebird is a pure JS client (requires server) or uses native bindings?
// 'node-firebird' is a pure JS implementation of the wire protocol. It NEEDS a running Firebird server.
// It cannot open FDB files directly without a server process listening on a port.

// This means the Python script or a service MUST be running.
// We will assume server is running on localhost:3050.

// Connection pooling: maintain a single persistent connection
let persistentConnection: Firebird.Database | null = null;
let connectionPromise: Promise<Firebird.Database> | null = null;

export async function connectDB(): Promise<Firebird.Database> {
    console.log('[DB] Attempting to attach to Firebird...');
    return new Promise((resolve, reject) => {
        Firebird.attach(options, (err, db) => {
            if (err) {
                console.error('[DB] Firebird attach failed:', err);
                return reject(err);
            }
            console.log('[DB] Firebird attach successful');
            resolve(db);
        });
    });
}

/**
 * Get or create a persistent database connection.
 * Implements connection pooling by reusing a single connection.
 * Includes a timeout to prevent indefinite hangs when Firebird is unreachable.
 */
async function getConnection(): Promise<Firebird.Database> {
    // If we have a working connection, return it
    if (persistentConnection) {
        return persistentConnection;
    }

    // If a connection is already being established, wait for it
    if (connectionPromise) {
        return connectionPromise;
    }

    const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds

    // Create a new connection with timeout
    connectionPromise = new Promise<Firebird.Database>((resolve, reject) => {
        // Pre-check: verify port is open before attempting attach
        const port = options.port || 3050;
        const host = options.host || '127.0.0.1';

        console.log(`[DB] Attempting persistent connection to ${host}:${port}...`);

        // Timeout guard — node-firebird has no built-in timeout
        const timeout = setTimeout(() => {
            connectionPromise = null;
            persistentConnection = null;
            reject(new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS / 1000}s — is Firebird running on ${host}:${port}?`));
        }, CONNECTION_TIMEOUT_MS);

        Firebird.attach(options, (err, db) => {
            clearTimeout(timeout);
            connectionPromise = null;

            if (err) {
                console.error('[DB] Failed to establish persistent connection:', err);
                persistentConnection = null;
                return reject(err);
            }

            console.log('[DB] Persistent connection established');
            persistentConnection = db;
            resolve(db);
        });
    });

    return connectionPromise;
}

/**
 * Close the persistent database connection.
 */
export function closeConnection(): void {
    if (persistentConnection) {
        persistentConnection.detach((err) => {
            if (err) {
                console.error('[DB] Error closing connection:', err);
            } else {
                console.log('[DB] Connection closed');
            }
            persistentConnection = null;
        });
    }
}

// Check if Firebird port is open
function isPortOpen(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000); // 2s timeout
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

// Ensure Firebird is running
export async function ensureFirebirdRunning(): Promise<boolean> {
    const port = dbConfig.port || 3050; // Use configured port or default
    const host = dbConfig.host || '127.0.0.1';

    console.log(`[DB] Checking if Firebird is running on ${host}:${port}...`);
    const isOpen = await isPortOpen(port, host);

    if (isOpen) {
        console.log('[DB] Firebird is already running.');
        return true;
    }

    console.log('[DB] Firebird port is closed. Attempting to start server...');
    const firebirdPath = config.firebird?.path;

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
        // We use spawn to start it detached so it keeps running
        const child = spawn(binPath, ['-a', '-p', String(port)], {
            detached: true,
            stdio: 'ignore', // Ignore stdio to allow it to run independently
            windowsHide: true // Hide the window
        });

        child.unref(); // Allow the parent to exit without waiting for the child

        // Now we need to wait for the port to open
        console.log('[DB] Waiting for Firebird to be ready...');

        let attempts = 0;
        const maxAttempts = 20; // 20 * 500ms = 10s timeout

        const checkInterval = setInterval(async () => {
            attempts++;
            const ready = await isPortOpen(port, host);
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

export async function checkConnection(): Promise<boolean> {
    try {
        await query('SELECT 1 FROM RDB$DATABASE');
        return true;
    } catch (e) {
        console.error('[DB] Check connection failed:', e);
        return false;
    }
}

// Simple query queue to avoid concurrent operations on a single Firebird connection,
// which has been observed to trigger internal driver errors in node-firebird.
let queryChain: Promise<unknown> = Promise.resolve();

async function executeQuery<T = unknown>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
    try {
        const db = await getConnection();

        return await new Promise<T[]>((resolve, reject) => {
            db.query(sql, params, (err, result) => {
                if (err) {
                    // Connection may be stale, reset it
                    persistentConnection = null;
                    return reject(err);
                }

                resolve(result as T[]);
            });
        });
    } catch (err) {
        console.error('[DB] Query failed:', err);
        throw err;
    }
}

export async function query<T = unknown>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
    const run = () => executeQuery<T>(sql, params);

    // Schedule this query to run after all previous queries complete,
    // regardless of whether they succeeded or failed.
    const p = queryChain.then(run, run);

    // Advance the chain, but swallow individual query results/errors
    // so that one failing query doesn't block the entire queue.
    queryChain = p.then(
        () => undefined,
        () => undefined
    );

    return p;
}

export async function runTransaction<T>(
    callback: (tx: Firebird.Transaction, txQuery: <R = unknown>(sql: string, params?: (string | number | null)[]) => Promise<R[]>) => Promise<T>,
    isolation: Firebird.Isolation = Firebird.ISOLATION_READ_COMMITTED
): Promise<T> {
    try {
        const db = await getConnection();

        return new Promise((resolve, reject) => {
            db.transaction(isolation, async (err, transaction) => {
                if (err) {
                    // Connection may be stale, reset it
                    persistentConnection = null;
                    return reject(err);
                }

                const txQuery = <R = unknown>(sql: string, params: (string | number | null)[] = []): Promise<R[]> => {
                    return new Promise((qResolve, qReject) => {
                        transaction.query(sql, params, (qErr, result) => {
                            if (qErr) return qReject(qErr);
                            qResolve(result as R[]);
                        });
                    });
                };

                try {
                    const result = await callback(transaction, txQuery);
                    transaction.commit((commitErr) => {
                        if (commitErr) {
                            persistentConnection = null;
                            return reject(commitErr);
                        }
                        resolve(result);
                    });
                } catch (cbErr) {
                    transaction.rollback((rollbackErr) => {
                        if (rollbackErr) console.error('[DB] Rollback error:', rollbackErr);
                        reject(cbErr);
                    });
                }
            });
        });
    } catch (err) {
        console.error('[DB] Transaction failed:', err);
        throw err;
    }
}

function pushFolderFilter(
    whereParts: string[], params: (string | number | null)[],
    folderId: number | undefined, folderIds: number[] | undefined,
    col: string = 'folder_id'
) {
    if (folderIds && folderIds.length > 0) {
        whereParts.push(`${col} IN (${folderIds.map(() => '?').join(', ')})`);
        params.push(...folderIds);
    } else if (folderId) {
        whereParts.push(`${col} = ?`);
        params.push(folderId);
    }
}

export async function getImageCount(options: ImageQueryOptions = {}): Promise<number> {
    const { folderId, folderIds, minRating, colorLabel, keyword } = options;
    const params: (string | number | null)[] = [];
    const whereParts: string[] = [];

    pushFolderFilter(whereParts, params, folderId, folderIds);

    if (minRating !== undefined && minRating > 0) {
        whereParts.push('rating >= ?');
        params.push(minRating);
    }

    if (colorLabel) {
        whereParts.push('label = ?');
        params.push(colorLabel);
    }

    if (keyword) {
        whereParts.push('keywords LIKE ?');
        params.push(`%${keyword}%`);
    }

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const rows = await query<{ count: number }>(`SELECT COUNT(*) as "count" FROM images ${whereClause}`, params);
    return rows[0]?.count || 0;
}

export interface ImageQueryOptions {
    limit?: number;
    offset?: number;
    folderId?: number;
    folderIds?: number[];
    minRating?: number;
    colorLabel?: string;
    keyword?: string;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
}

export async function getImages(options: ImageQueryOptions = {}): Promise<unknown[]> {
    const { limit = 50, offset = 0, folderId, folderIds, minRating, colorLabel, keyword, sortBy = 'score_general', order = 'DESC' } = options;
    const params: (string | number | null)[] = [];
    const whereParts: string[] = [];

    pushFolderFilter(whereParts, params, folderId, folderIds);

    if (minRating !== undefined && minRating > 0) {
        whereParts.push('rating >= ?');
        params.push(minRating);
    }

    if (colorLabel) {
        whereParts.push('label = ?');
        params.push(colorLabel);
    }

    if (keyword) {
        whereParts.push('keywords LIKE ?');
        params.push(`%${keyword}%`);
    }

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    // Validate sort column to prevent SQL injection
    const allowedSortColumns = [
        'id', 'created_at', 'score_general', 'score_technical', 'score_aesthetic',
        'score_spaq', 'score_ava', 'score_liqe',
        'rating', 'file_name'
    ];

    // Default to score_general if invalid
    const sortColumn = allowedSortColumns.includes(sortBy) ? `i.${sortBy}` : 'i.score_general';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    // Note: Offset/Limit in Firebird 3+ is OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    // But we need to put params in order. WHERE params come first.

    params.push(offset, limit);

    const sql = `
        SELECT 
            i.id, 
            COALESCE(fp.path, i.file_path) as file_path, 
            i.file_name, 
            i.score_general, 
            i.score_technical,
            i.score_aesthetic,
            i.score_spaq,
            i.score_ava,
            i.score_liqe,
            i.rating, 
            i.label, 
            i.created_at, 
            i.thumbnail_path
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    `;
    return query(sql, params);
}

// Cache for getKeywords to avoid re-fetching 45k+ rows repeatedly
let keywordsCache: { result: string[]; timestamp: number } | null = null;
const KEYWORDS_CACHE_TTL = 60_000; // 1 minute

export function invalidateKeywordsCache() {
    keywordsCache = null;
}

export async function getKeywords(): Promise<string[]> {
    // Return cached result if fresh
    if (keywordsCache && (Date.now() - keywordsCache.timestamp) < KEYWORDS_CACHE_TTL) {
        console.log(`[DB] getKeywords returning cached result (${keywordsCache.result.length} keywords)`);
        return keywordsCache.result;
    }

    // DISTINCT reduces rows sent over the wire when many images share keyword combos
    let sql = `SELECT DISTINCT CAST(keywords AS VARCHAR(8191)) as keywords FROM images WHERE keywords IS NOT NULL AND keywords <> ''`;

    console.log('[DB] Executing getKeywords SQL:', sql);

    try {
        let rows = await query<{ keywords: string | Buffer; KEYWORDS?: string | Buffer; KEYWORDS_1?: string | Buffer }>(sql);
        console.log(`[DB] getKeywords returned ${rows.length} distinct rows`);

        // Fallback if CAST returns nothing but plain query might work (unlikely but safe)
        if (rows.length === 0) {
            console.log('[DB] CAST query returned 0 rows. Retrying with raw BLOB query...');
            sql = `SELECT DISTINCT keywords FROM images WHERE keywords IS NOT NULL AND keywords <> ''`;
            rows = await query<{ keywords: string | Buffer; KEYWORDS?: string | Buffer; KEYWORDS_1?: string | Buffer }>(sql);
            console.log(`[DB] Fallback query returned ${rows.length} rows`);
        }

        const uniqueKeywords = new Set<string>();

        for (const row of rows) {
            const val = row.keywords || row.KEYWORDS || row.KEYWORDS_1;

            let kwStr = '';
            if (val) {
                if (Buffer.isBuffer(val)) {
                    kwStr = val.toString('utf8');
                } else if (typeof val === 'string') {
                    kwStr = val;
                }
            }

            if (kwStr) {
                const parts = kwStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
                parts.forEach(p => uniqueKeywords.add(p));
            }
        }

        const result = Array.from(uniqueKeywords).sort();
        console.log(`[DB] Found ${result.length} unique keywords`);

        keywordsCache = { result, timestamp: Date.now() };
        return result;
    } catch (e) {
        console.error('[DB] getKeywords failed:', e);
        return [];
    }
}

interface ImageDetailRow {
    id: number;
    job_id?: string;
    file_path: string;
    file_name: string;
    file_type?: string;
    score?: number;
    score_general?: number;
    score_technical?: number;
    score_aesthetic?: number;
    score_spaq?: number;
    score_ava?: number;
    score_liqe?: number;
    score_koniq?: number;
    score_paq2piq?: number;
    rating?: number;
    label?: string;
    title?: string;
    description?: string;
    keywords?: string;
    metadata?: string;
    scores_json?: string;
    model_version?: string;
    image_hash?: string;
    folder_id?: number;
    stack_id?: number;
    burst_uuid?: string;
    created_at?: string;
    thumbnail_path?: string;
    win_path?: string | null;
    file_exists?: boolean;
    image_uuid?: string;

    // EXIF Stats
    exif_iso?: number | null;
    exif_shutter?: string | null;
    exif_aperture?: string | null;
    exif_focal_length?: string | null;
    exif_model?: string | null;
    exif_lens_model?: string | null;
}

export async function getImageDetails(id: number): Promise<ImageDetailRow | null> {
    const sql = `
        SELECT 
            i.id,
            i.job_id,
            i.file_path,
            i.file_name,
            i.file_type,
            i.score,
            i.score_general,
            i.score_technical,
            i.score_aesthetic,
            i.score_spaq,
            i.score_ava,
            i.score_koniq,
            i.score_paq2piq,
            i.score_liqe,
            CAST(i.keywords AS VARCHAR(8191)) as keywords,
            CAST(i.title AS VARCHAR(8191)) as title,
            CAST(i.description AS VARCHAR(8191)) as description,
            i.metadata,
            i.thumbnail_path,
            i.scores_json,
            i.model_version,
            i.rating,
            i.label,
            i.image_hash,
            i.folder_id,
            i.stack_id,
            i.created_at,
            i.burst_uuid,
            i.image_uuid,
            fp.path as win_path,
            ex.iso as exif_iso,
            ex.exposure_time as exif_shutter,
            ex.f_number as exif_aperture,
            ex.focal_length as exif_focal_length,
            COALESCE(ex.model, ex.make) as exif_model,
            ex.lens_model as exif_lens_model
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        LEFT JOIN image_exif ex ON i.id = ex.image_id
        WHERE i.id = ?
    `;
    const rows = await query(sql, [id]);

    if (!rows || rows.length === 0) {
        return null;
    }

    const image: ImageDetailRow = rows[0] as ImageDetailRow;

    // Discard win_path if it's actually a thumbnail path (bad data in file_paths table)
    if (image.win_path && image.file_name) {
        const winExt = image.win_path.split('.').pop()?.toLowerCase();
        const fileExt = image.file_name.split('.').pop()?.toLowerCase();
        if (winExt && fileExt && winExt !== fileExt) {
            console.log(`[DB] Discarding bad win_path for image ${id}: "${image.win_path}" (ext mismatch with ${image.file_name})`);
            image.win_path = null;
        }
    }

    // Construct win_path from file_path if missing and on Windows
    if (!image.win_path && image.file_path && process.platform === 'win32') {
        const converted = image.file_path.replace(/^\/?mnt\/([a-zA-Z])\//, (_m: string, d: string) => `${d.toUpperCase()}:/`);
        if (converted !== image.file_path) {
            image.win_path = converted;
        }
    }

    // Check file existence
    let fileExists = false;
    let filePathToCheck = image.win_path || image.file_path;
    if (filePathToCheck) {
        if (process.platform === 'win32' && filePathToCheck.match(/^\/?mnt\/[a-zA-Z]\//)) {
            filePathToCheck = filePathToCheck.replace(/^\/?mnt\/([a-zA-Z])\//, (match: string, drive: string) => `${drive}:/`);
        }
        fileExists = fs.existsSync(filePathToCheck);
    }
    image.file_exists = fileExists;

    // Ultra-aggressive serialization: Convert EVERYTHING to JSON and parse back
    // This ensures absolutely no Firebird-specific or Node.js-specific objects remain
    const stringified = JSON.stringify(image, (key, value) => {
        // Custom replacer to handle special types
        if (Buffer.isBuffer(value)) {
            return value.toString('utf8');
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (value === undefined) {
            return null;
        }
        // For any other object, try to stringify it
        if (value && typeof value === 'object' && !(value instanceof Array)) {
            try {
                return JSON.parse(JSON.stringify(value));
            } catch {
                return String(value);
            }
        }
        return value;
    });

    return JSON.parse(stringified);
}

export async function getFolders(): Promise<unknown[]> {
    const rows = await query(`
        SELECT f.id, f.path, f.parent_id, f.is_fully_scored,
               (SELECT COUNT(1) FROM images i WHERE i.folder_id = f.id) as image_count
        FROM folders f
        ORDER BY f.path ASC
    `);


    return rows;
}


export async function getFolderPathById(id: number): Promise<string | null> {
    const rows = await query<{ path: string }>('SELECT path FROM folders WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0].path : null;
}

export async function deleteFolder(id: number): Promise<boolean> {
    try {
        await query('DELETE FROM folders WHERE id = ?', [id]);
        return true;
    } catch (e) {
        console.error('[DB] Failed to delete folder:', e);
        return false;
    }
}

/**
 * Strip erroneously concatenated absolute path (e.g. D:/Projects/image-scoring/D:/Photos/...).
 * Returns the canonical absolute path.
 */
function stripConcatenatedAbsolutePath(filePath: string): string {
    const withSlashes = filePath.replace(/\\/g, '/');
    const parts = withSlashes.split('/').filter(Boolean);
    const driveIndices: number[] = [];
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].length === 2 && parts[i][1] === ':' && /^[a-zA-Z]$/.test(parts[i][0])) {
            driveIndices.push(i);
        }
    }
    if (driveIndices.length >= 2) {
        const start = driveIndices[driveIndices.length - 1];
        return parts.slice(start).join('/');
    }
    // Mixed: /mnt/x/.../X:/ (WSL base + Windows path)
    const match = withSlashes.match(/\/([A-Za-z]):\//);
    if (match && withSlashes.includes('/mnt/')) {
        return withSlashes.slice((match.index ?? 0) + 1);
    }
    // /mnt/x/ appearing twice
    const firstMnt = withSlashes.indexOf('/mnt/');
    const secondMnt = withSlashes.indexOf('/mnt/', firstMnt + 6);
    if (secondMnt !== -1) {
        return withSlashes.slice(secondMnt);
    }
    return filePath;
}

/**
 * Normalize a file system path for consistent storage in the database.
 * Always stores paths in WSL format (/mnt/d/...) to match the Python backend.
 * On Windows, converts drive-letter paths (D:\... or D:/...) to /mnt/d/...
 * Paths already in WSL format are returned as-is (before resolve, to avoid mangling).
 */
function normalizePathForDb(filePath: string): string {
    filePath = stripConcatenatedAbsolutePath(filePath);
    const withSlashes = filePath.replace(/\\/g, '/');
    if (process.platform === 'win32') {
        // Pass through paths already in WSL format (e.g. from Python backend)
        if (withSlashes.match(/^\/mnt\/[a-zA-Z]\//)) {
            return withSlashes;
        }
        const resolved = path.resolve(filePath);
        const withForwardSlashes = resolved.replace(/\\/g, '/');
        const driveMatch = withForwardSlashes.match(/^([A-Za-z]):\//);
        if (driveMatch) {
            const drive = driveMatch[1].toLowerCase();
            const rest = withForwardSlashes.slice(3);
            return `/mnt/${drive}/${rest}`;
        }
        return withForwardSlashes;
    }
    return path.resolve(filePath);
}

/**
 * Get or create a folder by path. Creates parent folders recursively if needed.
 */
export async function getOrCreateFolder(folderPath: string): Promise<number> {
    folderPath = stripConcatenatedAbsolutePath(folderPath);
    const normalized = normalizePathForDb(folderPath);
    const existing = await query<{ id: number }>('SELECT id FROM folders WHERE path = ?', [normalized]);
    if (existing.length > 0) {
        return existing[0].id;
    }

    const parentPath = path.dirname(folderPath);
    const normalizedParent = normalizePathForDb(parentPath);
    let parentId: number | null = null;

    if (normalizedParent && normalizedParent !== normalized) {
        const isRoot = normalizedParent === path.dirname(normalizedParent) || normalizedParent.length <= 3;
        if (!isRoot) {
            parentId = await getOrCreateFolder(parentPath);
        }
    }

    try {
        const insertResult = await query<{ id: number }>(
            'INSERT INTO folders (path, parent_id, is_fully_scored, created_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP) RETURNING id',
            [normalized, parentId]
        );
        if (insertResult.length > 0) {
            return insertResult[0].id;
        }
    } catch (e) {
        const errStr = String(e);
        if (errStr.includes('RETURNING') || errStr.includes('syntax')) {
            await query('INSERT INTO folders (path, parent_id, is_fully_scored, created_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP)', [normalized, parentId]);
            const rows = await query<{ id: number }>('SELECT id FROM folders WHERE path = ?', [normalized]);
            if (rows.length > 0) return rows[0].id;
        }
        throw e;
    }

    const rows = await query<{ id: number }>('SELECT id FROM folders WHERE path = ?', [normalized]);
    if (rows.length > 0) return rows[0].id;
    throw new Error(`Failed to get folder id for path: ${normalized}`);
}

/**
 * Check if an image with the given file path already exists.
 */
export async function findImageByFilePath(filePath: string): Promise<number | null> {
    const normalized = normalizePathForDb(filePath);
    const rows = await query<{ id: number }>('SELECT id FROM images WHERE file_path = ?', [normalized]);
    return rows.length > 0 ? rows[0].id : null;
}

/**
 * Check if an image with the given IMAGE_UUID already exists.
 */
export async function findImageByUuid(uuid: string): Promise<number | null> {
    const rows = await query<{ id: number }>('SELECT id FROM images WHERE image_uuid = ?', [uuid]);
    return rows.length > 0 ? rows[0].id : null;
}

export interface InsertImageRow {
    file_path: string;
    file_name: string;
    file_type: string;
    folder_id: number;
    image_uuid?: string | null;
}

/**
 * Insert a new image record. Returns the new image id.
 */
export async function insertImage(row: InsertImageRow): Promise<number> {
    const normalizedPath = normalizePathForDb(row.file_path);
    const uuid = row.image_uuid ?? null;

    try {
        const insertResult = await query<{ id: number }>(
            'INSERT INTO images (file_path, file_name, file_type, folder_id, image_uuid, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING id',
            [normalizedPath, row.file_name, row.file_type, row.folder_id, uuid]
        );
        if (insertResult.length > 0) {
            return insertResult[0].id;
        }
    } catch (e) {
        const errStr = String(e);
        if (errStr.includes('RETURNING') || errStr.includes('syntax')) {
            await query(
                'INSERT INTO images (file_path, file_name, file_type, folder_id, image_uuid, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [normalizedPath, row.file_name, row.file_type, row.folder_id, uuid]
            );
            const rows = await query<{ id: number }>('SELECT id FROM images WHERE file_path = ? ORDER BY id DESC', [normalizedPath]);
            if (rows.length > 0) return rows[0].id;
        }
        throw e;
    }

    const rows = await query<{ id: number }>('SELECT id FROM images WHERE file_path = ? ORDER BY id DESC', [normalizedPath]);
    if (rows.length > 0) return rows[0].id;
    throw new Error(`Failed to get image id after insert: ${normalizedPath}`);
}

export async function updateImageDetails(id: number, updates: Record<string, string | number | null>): Promise<boolean> {
    const allowedFields = ['title', 'description', 'rating', 'label', 'keywords'];
    const setParts: string[] = [];
    const params: (string | number | null)[] = [];

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            setParts.push(`${field} = ?`);
            params.push(updates[field]);
        }
    }

    if (setParts.length === 0) return false;

    params.push(id);
    const sql = `UPDATE images SET ${setParts.join(', ')} WHERE id = ?`;

    try {
        await query(sql, params);

        if (updates['keywords'] !== undefined) {
            await syncImageKeywords(id, updates['keywords'] as string | null);
            invalidateKeywordsCache();
        }

        return true;
    } catch (e) {
        console.error('[DB] Update failed:', e);
        return false;
    }
}

export async function syncImageKeywords(imageId: number, keywordsStr: string | null): Promise<void> {
    try {
        await query('DELETE FROM image_keywords WHERE image_id = ?', [imageId]);
        
        if (!keywordsStr) return;
        
        const kws = keywordsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        if (kws.length === 0) return;
        
        for (const kw of Array.from(new Set(kws))) {
            const kwNorm = kw.toLowerCase();
            let kwId: number | null = null;
            
            const existing = await query<{ keyword_id: number }>('SELECT keyword_id FROM keywords_dim WHERE keyword_norm = ?', [kwNorm]);
            if (existing.length > 0) {
                kwId = existing[0].keyword_id;
            } else {
                try {
                    const insertResult = await query<{ keyword_id: number }>(
                        'INSERT INTO keywords_dim (keyword_norm, keyword_display) VALUES (?, ?) RETURNING keyword_id',
                        [kwNorm, kw]
                    );
                    if (insertResult.length > 0) {
                        kwId = insertResult[0].keyword_id;
                    }
                } catch (e) {
                    const errStr = String(e);
                    if (errStr.includes('RETURNING') || errStr.includes('syntax')) {
                        await query('INSERT INTO keywords_dim (keyword_norm, keyword_display) VALUES (?, ?)', [kwNorm, kw]);
                        const rows = await query<{ keyword_id: number }>('SELECT keyword_id FROM keywords_dim WHERE keyword_norm = ?', [kwNorm]);
                        if (rows.length > 0) kwId = rows[0].keyword_id;
                    } else {
                        throw e;
                    }
                }
            }
            
            if (kwId !== null) {
                await query(
                    'UPDATE OR INSERT INTO image_keywords (image_id, keyword_id, source, confidence) VALUES (?, ?, ?, ?) MATCHING (image_id, keyword_id)',
                    [imageId, kwId, 'electron_ui', 1.0]
                );
            }
        }
    } catch (e) {
        console.error(`[DB] syncImageKeywords failed for image ${imageId}:`, e);
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface StackQueryOptions extends ImageQueryOptions {
    // Intentional named alias — inherits all filter options from ImageQueryOptions
}

// ---- Stack Cache ----
// The stack_cache table stores pre-computed MIN/MAX of each score column per stack_id.
// This avoids expensive GROUP BY aggregation on every request.

let stackCacheInitPromise: Promise<void> | null = null;

export async function ensureStackCacheTable(): Promise<void> {
    if (stackCacheInitPromise) return stackCacheInitPromise;

    stackCacheInitPromise = (async () => {
        try {
            await query(`
                SELECT 1 FROM stack_cache WHERE 1=0
            `);
        } catch {
            // Table doesn't exist, create it
            try {
                await query(`
                    CREATE TABLE stack_cache (
                        stack_id INTEGER NOT NULL PRIMARY KEY,
                        image_count INTEGER DEFAULT 0,
                        rep_image_id INTEGER,
                        min_score_general DOUBLE PRECISION,
                        max_score_general DOUBLE PRECISION,
                        min_score_technical DOUBLE PRECISION,
                        max_score_technical DOUBLE PRECISION,
                        min_score_aesthetic DOUBLE PRECISION,
                        max_score_aesthetic DOUBLE PRECISION,
                        min_score_spaq DOUBLE PRECISION,
                        max_score_spaq DOUBLE PRECISION,
                        min_score_ava DOUBLE PRECISION,
                        max_score_ava DOUBLE PRECISION,
                        min_score_liqe DOUBLE PRECISION,
                        max_score_liqe DOUBLE PRECISION,
                        min_rating INTEGER,
                        max_rating INTEGER,
                        min_created_at TIMESTAMP,
                        max_created_at TIMESTAMP,
                        folder_id INTEGER
                    )
                `);
                console.log('[DB] Created stack_cache table');
            } catch (e2) {
                const errStr = String(e2);
                if (errStr.includes('RDB$RELATION_NAME') || errStr.includes('exists')) {
                    console.log('[DB] stack_cache table already exists (race condition ignored)');
                } else {
                    console.error('[DB] Failed to create stack_cache table:', e2);
                    // Reset promise on failure to allow retry
                    stackCacheInitPromise = null;
                    throw e2;
                }
            }
        }
    })();

    return stackCacheInitPromise;
}

let rebuildPromise: Promise<number> | null = null;
let pendingRebuild: boolean = false;

export async function rebuildStackCache(): Promise<number> {
    // If a rebuild is already in progress, queue another one to run when it finishes
    if (rebuildPromise) {
        console.log('[DB] Stack cache rebuild already in progress, queuing another request...');
        pendingRebuild = true;
        return rebuildPromise;
    }

    const runRebuild = async (): Promise<number> => {
        try {
            await ensureStackCacheTable();

            return await runTransaction(async (tx, txQuery) => {
                // Clear existing cache
                await txQuery('DELETE FROM stack_cache');

                // Populate from images table - only for actual stacks (stack_id IS NOT NULL)
                const sql = `
                    INSERT INTO stack_cache (
                        stack_id, image_count, rep_image_id, folder_id,
                        min_score_general, max_score_general,
                        min_score_technical, max_score_technical,
                        min_score_aesthetic, max_score_aesthetic,
                        min_score_spaq, max_score_spaq,
                        min_score_ava, max_score_ava,
                        min_score_liqe, max_score_liqe,
                        min_rating, max_rating,
                        min_created_at, max_created_at
                    )
                    SELECT
                        i.stack_id,
                        COUNT(*),
                        MIN(i.id),
                        MIN(i.folder_id),
                        MIN(i.score_general), MAX(i.score_general),
                        MIN(i.score_technical), MAX(i.score_technical),
                        MIN(i.score_aesthetic), MAX(i.score_aesthetic),
                        MIN(i.score_spaq), MAX(i.score_spaq),
                        MIN(i.score_ava), MAX(i.score_ava),
                        MIN(i.score_liqe), MAX(i.score_liqe),
                        MIN(i.rating), MAX(i.rating),
                        MIN(i.created_at), MAX(i.created_at)
                    FROM images i
                    WHERE i.stack_id IS NOT NULL
                    GROUP BY i.stack_id
                `;

                await txQuery(sql);

                // Update rep_image_id to be the image with the highest general score in each stack
                await txQuery(`
                    MERGE INTO stack_cache sc
                    USING (
                        SELECT i.stack_id, MIN(i.id) as best_id
                        FROM images i
                        WHERE i.stack_id IS NOT NULL
                          AND i.score_general = (
                              SELECT MAX(i2.score_general) FROM images i2 WHERE i2.stack_id = i.stack_id
                          )
                        GROUP BY i.stack_id
                    ) src
                    ON sc.stack_id = src.stack_id
                    WHEN MATCHED THEN UPDATE SET sc.rep_image_id = src.best_id
                `);

                const countRows = await txQuery<{ cnt: number }>('SELECT COUNT(*) as "cnt" FROM stack_cache');
                const count = countRows[0]?.cnt || 0;
                console.log(`[DB] Stack cache rebuilt: ${count} stacks cached`);
                return count;
            });
        } finally {
            rebuildPromise = null;
            if (pendingRebuild) {
                pendingRebuild = false;
                console.log('[DB] Running queued stack cache rebuild...');
                // intentionally do not await here so we don't block the previous caller
                // but we start the next cycle
                rebuildStackCache().catch(console.error);
            }
        }
    };

    rebuildPromise = runRebuild();
    return rebuildPromise;
}

export async function getStacks(options: StackQueryOptions = {}): Promise<unknown[]> {
    const { limit = 50, offset = 0, folderId, folderIds, minRating, colorLabel, keyword, sortBy = 'score_general', order = 'DESC' } = options;

    await ensureStackCacheTable();

    const allowedSortColumns = [
        'id', 'created_at', 'score_general', 'score_technical', 'score_aesthetic',
        'score_spaq', 'score_ava', 'score_liqe',
        'rating', 'file_name'
    ];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'score_general';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    // Map sort column to cache column
    const cacheColMap: Record<string, string> = {
        'score_general': sortOrder === 'DESC' ? 'sc.max_score_general' : 'sc.min_score_general',
        'score_technical': sortOrder === 'DESC' ? 'sc.max_score_technical' : 'sc.min_score_technical',
        'score_aesthetic': sortOrder === 'DESC' ? 'sc.max_score_aesthetic' : 'sc.min_score_aesthetic',
        'score_spaq': sortOrder === 'DESC' ? 'sc.max_score_spaq' : 'sc.min_score_spaq',
        'score_ava': sortOrder === 'DESC' ? 'sc.max_score_ava' : 'sc.min_score_ava',
        'score_liqe': sortOrder === 'DESC' ? 'sc.max_score_liqe' : 'sc.min_score_liqe',
        'rating': sortOrder === 'DESC' ? 'sc.max_rating' : 'sc.min_rating',
        'created_at': sortOrder === 'DESC' ? 'sc.max_created_at' : 'sc.min_created_at',
        'file_name': 'i.file_name',
        'id': 'sc.rep_image_id'
    };

    const cacheSortCol = cacheColMap[sortColumn] || (sortOrder === 'DESC' ? 'sc.max_score_general' : 'sc.min_score_general');
    const nonStackSortCol = allowedSortColumns.includes(sortBy) ? `i.${sortBy}` : 'i.score_general';

    // Params for the union query (need to push them twice, once for top half, once for bottom)
    const topParams: (string | number | null)[] = [];
    const botParams: (string | number | null)[] = [];
    const wherePartsCache: string[] = [];
    const wherePartsNonStack: string[] = ['i.stack_id IS NULL'];

    pushFolderFilter(wherePartsCache, topParams, folderId, folderIds, 'sc.folder_id');
    pushFolderFilter(wherePartsNonStack, botParams, folderId, folderIds, 'i.folder_id');

    if (minRating !== undefined && minRating > 0) {
        wherePartsCache.push('sc.max_rating >= ?');
        topParams.push(minRating);

        wherePartsNonStack.push('i.rating >= ?');
        botParams.push(minRating);
    }

    if (colorLabel) {
        // Filter stacks where at least one member image has this label
        wherePartsCache.push('EXISTS (SELECT 1 FROM images ci WHERE ci.stack_id = sc.stack_id AND ci.label = ?)');
        topParams.push(colorLabel);

        wherePartsNonStack.push('i.label = ?');
        botParams.push(colorLabel);
    }

    if (keyword) {
        // Filter stacks where at least one member image has this keyword
        wherePartsCache.push('EXISTS (SELECT 1 FROM images ci WHERE ci.stack_id = sc.stack_id AND ci.keywords LIKE ?)');
        topParams.push(`%${keyword}%`);

        wherePartsNonStack.push('i.keywords LIKE ?');
        botParams.push(`%${keyword}%`);
    }

    const whereClauseCache = wherePartsCache.length > 0 ? 'WHERE ' + wherePartsCache.join(' AND ') : '';
    const whereClauseNonStack = 'WHERE ' + wherePartsNonStack.join(' AND ');

    const sql = `
        SELECT * FROM (
            SELECT
                sc.stack_id,
                CAST(sc.stack_id AS BIGINT) as stack_key,
                sc.image_count,
                ${cacheSortCol} as sort_value,
                sc.rep_image_id,
                i.id,
                COALESCE(fp.path, i.file_path) as file_path,
                i.file_name,
                i.score_general,
                i.score_technical,
                i.score_aesthetic,
                i.score_spaq,
                i.score_ava,
                i.score_liqe,
                i.rating,
                i.label,
                i.created_at,
                i.thumbnail_path
            FROM stack_cache sc
            JOIN images i ON i.id = sc.rep_image_id
            LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
                AND POSITION('/thumbnails/' IN fp.path) = 0
            ${whereClauseCache}

            UNION ALL

            SELECT
                i.stack_id,
                CAST(-i.id AS BIGINT) as stack_key,
                1 as image_count,
                ${nonStackSortCol} as sort_value,
                i.id as rep_image_id,
                i.id,
                COALESCE(fp.path, i.file_path) as file_path,
                i.file_name,
                i.score_general,
                i.score_technical,
                i.score_aesthetic,
                i.score_spaq,
                i.score_ava,
                i.score_liqe,
                i.rating,
                i.label,
                i.created_at,
                i.thumbnail_path
            FROM images i
            LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
                AND POSITION('/thumbnails/' IN fp.path) = 0
            ${whereClauseNonStack}
        ) a
        ORDER BY a.sort_value ${sortOrder}, a.stack_key DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    `;

    return query(sql, [...topParams, ...botParams, offset, limit]);
}

export async function getImagesByStack(stackId: number | null, options: ImageQueryOptions = {}): Promise<unknown[]> {
    const { limit = 200, offset = 0, folderId, minRating, colorLabel, keyword, sortBy = 'score_general', order = 'DESC' } = options;
    const params: (string | number | null)[] = [];
    const whereParts: string[] = [];

    if (stackId !== null && stackId !== undefined) {
        whereParts.push('i.stack_id = ?');
        params.push(stackId);
    }

    if (folderId && (stackId === null || stackId === undefined)) {
        whereParts.push('i.folder_id = ?');
        params.push(folderId);
    }

    if (minRating !== undefined && minRating > 0) {
        whereParts.push('i.rating >= ?');
        params.push(minRating);
    }

    if (colorLabel) {
        whereParts.push('i.label = ?');
        params.push(colorLabel);
    }

    if (keyword) {
        whereParts.push('i.keywords LIKE ?');
        params.push(`%${keyword}%`);
    }

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const allowedSortColumns = [
        'id', 'created_at', 'score_general', 'score_technical', 'score_aesthetic',
        'score_spaq', 'score_ava', 'score_liqe',
        'rating', 'file_name'
    ];
    const sortColumn = allowedSortColumns.includes(sortBy) ? `i.${sortBy}` : 'i.score_general';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    params.push(offset, limit);

    const sql = `
        SELECT 
            i.id, 
            COALESCE(fp.path, i.file_path) as file_path, 
            i.file_name, 
            i.score_general, 
            i.score_technical,
            i.score_aesthetic,
            i.score_spaq,
            i.score_ava,
            i.score_liqe,
            i.rating, 
            i.label, 
            i.created_at, 
            i.thumbnail_path,
            i.stack_id
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    `;
    return query(sql, params);
}

export async function getStackCount(options: StackQueryOptions = {}): Promise<number> {
    const { folderId, folderIds, minRating, colorLabel, keyword } = options;
    const params: (string | number | null)[] = [];
    const whereParts: string[] = [];

    pushFolderFilter(whereParts, params, folderId, folderIds, 'i.folder_id');

    if (minRating !== undefined && minRating > 0) {
        whereParts.push('i.rating >= ?');
        params.push(minRating);
    }

    if (colorLabel) {
        whereParts.push('i.label = ?');
        params.push(colorLabel);
    }

    if (keyword) {
        whereParts.push('i.keywords LIKE ?');
        params.push(`%${keyword}%`);
    }

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const sql = `
        SELECT COUNT(*) as "count" FROM (
            SELECT COALESCE(i.stack_id, -i.id) as stack_key
            FROM images i
            ${whereClause}
            GROUP BY COALESCE(i.stack_id, -i.id)
        )
    `;

    const rows = await query<{ count: number }>(sql, params);
    return rows[0]?.count || 0;
}

export async function deleteImage(id: number): Promise<boolean> {
    console.log(`[DB] Request to delete image ID: ${id}`);

    // 1. Get file path details
    const image = await getImageDetails(id);

    if (!image) {
        console.error('[DB] Image not found for deletion');
        return false;
    }

    // 2. Determine file path to delete
    // Prefer win_path (from file_paths table), fallback to file_path
    let filePathToDelete = image.win_path || image.file_path;

    if (!filePathToDelete) {
        console.error('[DB] No file path found for image');
        // We might still want to delete the DB record if the file is missing? 
        // For now, let's try to proceed with DB deletion even if file path is missing, 
        // but if we HAVE a path, we try to delete it.
    } else {
        // Convert WSL path if needed
        if (process.platform === 'win32') {
            // Handle /mnt/d/... -> d:/...
            if (filePathToDelete.match(/^\/?mnt\/[a-zA-Z]\//)) {
                filePathToDelete = filePathToDelete.replace(/^\/?mnt\/([a-zA-Z])\//, (match: string, drive: string) => `${drive}:/`);
            }
            // Ensure backslashes for Windows? Node handles forward slashes fine usually, but let's be safe if needed.
            // Actually Node fs accepts forward slashes on Windows.
        }

        console.log(`[DB] Attempting to delete file: ${filePathToDelete}`);

        try {
            if (fs.existsSync(filePathToDelete)) {
                await fs.promises.unlink(filePathToDelete);
                console.log('[DB] File deleted successfully');
            } else {
                console.warn('[DB] File does not exist on disk, skipping file deletion');
            }
        } catch (e: unknown) {
            console.error('[DB] Failed to delete file:', e);
            // We should probably stop if file deletion fails to avoid consistency issues?
            // Or should we allow "force delete"? 
            // The user prompt implies "delete source image... AND db record". 
            // If we can't delete the source, maybe we should NOT delete the DB record so the user can try again?
            // But if the file is locked, they might want to just remove the record.
            // Let's log error but PROCEED to delete DB record, assuming the user wants it gone from the app.
            // Actually, let's be safe: if unlink fails (permission/locked), we might want to keep the record
            // so the user knows it's still there.
            // BUT, usually "delete" in gallery means "get it out of my face".
            // I'll proceed with DB deletion but log the error.
        }
    }

    // 3. Delete from DB
    // We also need to delete from file_paths if we have a foreign key?
    // Firebird usually enforces FK constraints.
    // If 'images' is the parent, deleting it might fail if child records exist in 'file_paths'
    // UNLESS there is ON DELETE CASCADE.
    // The schema is not fully visible here, but usually we should delete from child tables first or rely on cascade.
    // Let's assume cascade or manual cleanup.
    // Given the previous code was just `DELETE FROM images`, it implies either Cascade exists or no dependencies blocking it.

    try {
        await query('DELETE FROM images WHERE id = ?', [id]);
        console.log('[DB] Database record deleted');
        return true;
    } catch (e) {
        console.error('[DB] Delete failed:', e);
        return false;
    }
}

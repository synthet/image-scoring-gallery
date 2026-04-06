import path from 'path';
import fs from 'fs';

import { getConfigPath, loadAppConfig } from './config';
import { absolutizeThumbnailPath } from './thumbnailPathNormalize';
import type { AppConfig, DatabaseConfig } from './types';
import { createDatabaseConnector, IDatabaseConnector, QueryParam, TxQuery } from './db/provider';

// Load configuration
function loadConfig(): AppConfig {
    return loadAppConfig(getConfigPath(__dirname));
}

const config = loadConfig();
const dbConfig = config.database || {};
const projectRoot = path.resolve(__dirname, '..');

/** Returns the pagination clause for the current dialect. */
function paginationSql(): string {
    return 'LIMIT ? OFFSET ?';
}

/**
 * Returns paging params in the order the expected.
 */
function pagingParams(offset: number, limit: number): number[] {
    return [limit, offset];
}

/** PostgreSQL default for DESC is NULLS FIRST; gallery sort should rank real values first. */
function pgNullsLastIfDesc(sortOrder: string): string {
    return sortOrder === 'DESC' ? ' NULLS LAST' : '';
}

/**
 * Returns a column expression that coerces a TEXT column to a plain string.
 */
function castTextExpr(col: string): string {
    return `${col}::text`;
}

/**
 * Returns a COUNT expression that guarantees a JS number (not a driver-specific bigint).
 */
function countBigint(expr = '*'): string {
    return `COUNT(${expr})::bigint`;
}

/** Optional config: see config.example.json → paths */
interface PathsConfig {
    /** Explicit from→to replacements for thumbnail_path (applied after win/WSL resolution) */
    thumbnail_path_remap?: Array<{ from: string; to: string }>;
    /**
     * When true (default), rewrite .../image-scoring/thumbnails/ → .../image-scoring-backend/thumbnails/
     * so a renamed backend repo folder still finds on-disk JPEGs.
     */
    remap_legacy_image_scoring_thumbnails?: boolean;
    /**
     * Absolute folder where JPEG thumbnails live (set in config to your machine’s thumbnails root).
     * Used when the DB stores a repo-relative path like thumbnails\\ab\\hash.jpg.
     * If unset, uses ../image-scoring-backend/thumbnails next to the gallery repo when that folder exists.
     */
    thumbnail_base_dir?: string;
}

function getPathsConfig(): PathsConfig {
    return ((config as { paths?: PathsConfig }).paths) || {};
}

/** Match Python modules/thumbnails.thumb_path_to_win */
function thumbPathStringToWin(wslPath: string | null | undefined): string | undefined {
    if (!wslPath || typeof wslPath !== 'string') return undefined;
    const p = wslPath.replace(/\\/g, '/');
    const m = p.match(/^\/?mnt\/([a-zA-Z])\/(.*)/i);
    if (m) {
        const drive = m[1].toUpperCase();
        const rest = m[2].replace(/\//g, '\\');
        return `${drive}:\\${rest}`;
    }
    return wslPath;
}

/** After repo rename image-scoring → image-scoring-backend; optional user remaps from config */
function applyThumbnailPathRemaps(p: string): string {
    let out = p;
    const pathsCfg = getPathsConfig();
    for (const pair of pathsCfg.thumbnail_path_remap || []) {
        const from = pair?.from;
        const to = pair?.to;
        if (from && to && out.includes(from)) {
            out = out.split(from).join(to);
        }
    }
    if (pathsCfg.remap_legacy_image_scoring_thumbnails !== false) {
        out = out.replace(/([/\\])image-scoring([/\\]thumbnails[/\\])/gi, '$1image-scoring-backend$2');
    }
    return out;
}

/** Resolve repo-relative thumbnail paths against thumbnail_base_dir or default sibling backend thumbnails/. */
function absolutizeThumbnailIfRelative(p: string): string {
    const cfgBase = getPathsConfig().thumbnail_base_dir?.trim();
    return absolutizeThumbnailPath(p, projectRoot, cfgBase || undefined);
}

/**
 * Paths the renderer should use for media:// (Windows: prefer thumbnail_path_win).
 * Applies optional folder remaps for renamed backend checkouts.
 */
export function resolveThumbnailPathForDisplay(
    thumbnailPathWin: unknown,
    thumbnailPathWsl: unknown
): string | undefined {
    const win = typeof thumbnailPathWin === 'string' && thumbnailPathWin.trim() ? thumbnailPathWin.trim() : undefined;
    const wsl = typeof thumbnailPathWsl === 'string' && thumbnailPathWsl.trim() ? thumbnailPathWsl.trim() : undefined;
    let raw: string | undefined;
    if (process.platform === 'win32') {
        raw = win || thumbPathStringToWin(wsl) || wsl;
    } else {
        raw = wsl || win;
    }
    if (!raw) return undefined;
    const remapped = applyThumbnailPathRemaps(raw);
    return absolutizeThumbnailIfRelative(remapped);
}

function normalizeImageRowThumbnails(row: Record<string, unknown>): void {
    const win = row.thumbnail_path_win ?? row.THUMBNAIL_PATH_WIN;
    const wsl = row.thumbnail_path ?? row.THUMBNAIL_PATH;
    const resolved = resolveThumbnailPathForDisplay(win, wsl);
    if (resolved !== undefined) {
        row.thumbnail_path = resolved;
    }
    delete row.thumbnail_path_win;
    delete row.THUMBNAIL_PATH_WIN;
}

/** Normalizes thumbnail paths on a typed row and returns it — convenience wrapper over normalizeImageRowThumbnails. */
function normalizeImageRowOutput<T extends object>(row: T): T {
    normalizeImageRowThumbnails(row as Record<string, unknown>);
    return row;
}

function mapRowsThumbnails(rows: unknown[]): unknown[] {
    for (const r of rows) {
        if (r && typeof r === 'object') {
            normalizeImageRowOutput(r as Record<string, unknown>);
        }
    }
    return rows;
}

const connector: IDatabaseConnector = createDatabaseConnector({
    dbConfig: dbConfig as DatabaseConfig,
});

export async function connectDB(): Promise<void> {
    await connector.connect();
}
export function closeConnection(): void {
    void connector.close().catch((e) => {
        console.error('[DB] Error while closing database connection:', e);
    });
}

/** Connector-aware startup: verifies database connectivity (Postgres pool check, API health, etc.) */
export async function initializeDatabaseProvider(): Promise<boolean> {
    return connector.verifyStartup();
}

export async function checkConnection(): Promise<boolean> {
    return connector.checkConnection();
}

export async function query<T = unknown>(sql: string, params: QueryParam[] = []): Promise<T[]> {
    return connector.query<T>(sql, params);
}

export async function runTransaction<T>(
    callback: (txQuery: TxQuery) => Promise<T>
): Promise<T> {
    return connector.runTransaction(callback);
}

/** `LIKE` prefixes for `images.file_path` under a Windows sync destination root (also matches WSL `/mnt/x/...`). */
function syncDestinationPathLikeParams(destRootWin: string): { destLike: string; wslLike: string } {
    const destNorm = destRootWin.replace(/\\/g, '/');
    const destLike = destNorm.endsWith('/') ? `${destNorm}%` : `${destNorm}/%`;
    const wslLike = destNorm.replace(/^([A-Za-z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`) + '%';
    return { destLike, wslLike };
}

/**
 * Latest calendar shoot date (YYYY-MM-DD) from indexed EXIF under the destination tree.
 * Uses COALESCE(date_time_original, create_date) per row; ignores images with no EXIF row or no dates.
 */
export async function getMaxIndexedCaptureDateUnderDestRoot(destRootWin: string): Promise<string | null> {
    const { destLike, wslLike } = syncDestinationPathLikeParams(destRootWin);
    const rows = await query<{ max_date: string | null }>(
        `SELECT MAX((COALESCE(e.date_time_original, e.create_date))::date)::text AS max_date
         FROM images i
         INNER JOIN image_exif e ON e.image_id = i.id
         WHERE (i.file_path LIKE ? OR i.file_path LIKE ?)
           AND (e.date_time_original IS NOT NULL OR e.create_date IS NOT NULL)`,
        [destLike, wslLike]
    );
    const v = rows[0]?.max_date;
    return v && String(v).trim() ? String(v).trim() : null;
}

/** Latest import date (YYYY-MM-DD) for any indexed image under the destination tree. */
export async function getMaxIndexedCreatedDateUnderDestRoot(destRootWin: string): Promise<string | null> {
    const { destLike, wslLike } = syncDestinationPathLikeParams(destRootWin);
    const rows = await query<{ max_date: string | null }>(
        `SELECT MAX((i.created_at)::date)::text AS max_date FROM images i
         WHERE i.file_path LIKE ? OR i.file_path LIKE ?`,
        [destLike, wslLike]
    );
    const v = rows[0]?.max_date;
    return v && String(v).trim() ? String(v).trim() : null;
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
        whereParts.push(`EXISTS (
            SELECT 1 FROM image_keywords ik
            JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id
            WHERE ik.image_id = images.id
            AND (LOWER(kd.keyword_display) LIKE LOWER(?) OR LOWER(kd.keyword_norm) LIKE LOWER(?))
        )`);
        params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const rows = await query<{ count: number }>(`SELECT ${countBigint()} as "count" FROM images ${whereClause}`, params);
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
    smartCover?: boolean;
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
        whereParts.push(`EXISTS (
            SELECT 1 FROM image_keywords ik
            JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id
            WHERE ik.image_id = i.id
            AND (LOWER(kd.keyword_display) LIKE LOWER(?) OR LOWER(kd.keyword_norm) LIKE LOWER(?))
        )`);
        params.push(`%${keyword}%`, `%${keyword}%`);
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
            i.thumbnail_path_win
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}${pgNullsLastIfDesc(sortOrder)}
        ${paginationSql()}
    `;
    const rows = await query(sql, [...params, ...pagingParams(offset, limit)]);
    return mapRowsThumbnails(rows);
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

    // Fetch from normalized keywords_dim table, sorted by keyword_display
    const sql = `SELECT DISTINCT keyword_display FROM keywords_dim WHERE keyword_display IS NOT NULL AND keyword_display <> '' ORDER BY keyword_display ASC`;

    console.log('[DB] Executing getKeywords SQL:', sql);

    try {
        const rows = await query<{ keyword_display: string }>(sql);
        console.log(`[DB] getKeywords returned ${rows.length} distinct keywords`);

        const result = rows.map(row => row.keyword_display).filter(kw => kw && kw.length > 0);
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
            (SELECT string_agg(kd.keyword_display, ', ') 
             FROM image_keywords ik 
             JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id 
             WHERE ik.image_id = i.id) as keywords,
            ${castTextExpr('i.title')} as title,
            ${castTextExpr('i.description')} as description,
            i.metadata,
            i.thumbnail_path,
            i.thumbnail_path_win,
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

    const image: ImageDetailRow = normalizeImageRowOutput(rows[0] as ImageDetailRow);

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
    // This ensures absolutely no driver-specific or Node.js-specific objects remain
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
               (SELECT ${countBigint('1')} FROM images i WHERE i.folder_id = f.id) as image_count
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
 * Strip erroneously concatenated absolute path (e.g. `D:/repo/D:/Photos/...`).
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
export function normalizePathForDb(filePath: string): string {
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

    const insertResult = await query<{ id: number }>(
        'INSERT INTO folders (path, parent_id, is_fully_scored, created_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP) RETURNING id',
        [normalized, parentId]
    );
    if (insertResult.length > 0) {
        return insertResult[0].id;
    }

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

    const insertResult = await query<{ id: number }>(
        'INSERT INTO images (file_path, file_name, file_type, folder_id, image_uuid, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING id',
        [normalizedPath, row.file_name, row.file_type, row.folder_id, uuid]
    );
    if (insertResult.length > 0) {
        return insertResult[0].id;
    }

    throw new Error(`Failed to get image id after insert: ${normalizedPath}`);
}

/** Matches `modules/indexing_runner.py` INDEXING_VERSION and backend import-register. */
const IMPORT_INDEXING_EXECUTOR_VERSION = '1.0.0';
const IMPORT_INDEXING_APP_VERSION = 'electron-gallery';

async function invalidateFolderPhaseAggregatesForImage(imageId: number): Promise<void> {
    const imgRows = await query<{ folder_id: number | null }>('SELECT folder_id FROM images WHERE id = ?', [imageId]);
    let folderId: number | null = imgRows[0]?.folder_id ?? null;
    const ancestorIds: number[] = [];
    const seen = new Set<number>();
    while (folderId != null && !seen.has(folderId)) {
        seen.add(folderId);
        ancestorIds.push(folderId);
        const parentRows = await query<{ parent_id: number | null }>('SELECT parent_id FROM folders WHERE id = ?', [folderId]);
        folderId = parentRows[0]?.parent_id ?? null;
    }
    if (ancestorIds.length === 0) {
        return;
    }
    const ph = ancestorIds.map(() => '?').join(', ');
    await query(`UPDATE folders SET phase_agg_dirty = 1 WHERE id IN (${ph})`, ancestorIds);
}

/**
 * Mark the indexing (Discovery) phase complete for an image after direct-DB import.
 * Mirrors backend `set_image_phase_status` + folder aggregate invalidation.
 */
export async function markImageIndexingPhaseDone(imageId: number): Promise<void> {
    const phaseRows = await query<{ id: number }>(
        'SELECT id FROM pipeline_phases WHERE code = ? LIMIT 1',
        ['indexing']
    );
    const phaseId = phaseRows[0]?.id;
    if (phaseId == null) {
        console.warn('[DB] markImageIndexingPhaseDone: no pipeline_phases row for indexing');
        return;
    }
    await query(
        `INSERT INTO image_phase_status (
            image_id, phase_id, status, app_version, executor_version,
            attempt_count, last_error, started_at, finished_at, updated_at, skip_reason, skipped_by
        ) VALUES (?, ?, 'done', ?, ?, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)
        ON CONFLICT (image_id, phase_id) DO UPDATE SET
            status = 'done',
            app_version = EXCLUDED.app_version,
            executor_version = EXCLUDED.executor_version,
            finished_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP,
            last_error = NULL,
            skip_reason = NULL,
            skipped_by = NULL`,
        [imageId, phaseId, IMPORT_INDEXING_APP_VERSION, IMPORT_INDEXING_EXECUTOR_VERSION]
    );
    await invalidateFolderPhaseAggregatesForImage(imageId);
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
                const insertResult = await query<{ keyword_id: number }>(
                    'INSERT INTO keywords_dim (keyword_norm, keyword_display) VALUES (?, ?) RETURNING keyword_id',
                    [kwNorm, kw]
                );
                if (insertResult.length > 0) {
                    kwId = insertResult[0].keyword_id;
                }
            }
            
            if (kwId !== null) {
                // Postgres: INSERT ... ON CONFLICT DO UPDATE
                await query(`
                    INSERT INTO image_keywords (image_id, keyword_id, source, confidence)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT (image_id, keyword_id) DO UPDATE
                        SET source = EXCLUDED.source, confidence = EXCLUDED.confidence
                `, [imageId, kwId, 'electron_ui', 1.0]);
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
                if (
                    errStr.includes('42P07') ||
                    errStr.toLowerCase().includes('already exists') ||
                    errStr.includes('exists')
                ) {
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
/** Merged context for a follow-up rebuild when callers arrive while `rebuildPromise` is active. */
let pendingAfterCurrent: { smartCover?: boolean } | null = null;

export async function rebuildStackCache(context: { smartCover?: boolean } = {}): Promise<number> {
    // If a rebuild is already in progress, queue one follow-up and merge caller context (last wins per key).
    if (rebuildPromise) {
        console.log('[DB] Stack cache rebuild already in progress, queuing another request...');
        pendingAfterCurrent = { ...(pendingAfterCurrent ?? {}), ...context };
        return rebuildPromise;
    }

    const runRebuild = async (): Promise<number> => {
        try {
            await ensureStackCacheTable();

            return await runTransaction(async (txQuery) => {
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

                // Update rep_image_id to be the image with the highest general score in each stack.
                // Postgres uses INSERT ... ON CONFLICT DO UPDATE.
                await txQuery(`
                    INSERT INTO stack_cache (stack_id, rep_image_id)
                    SELECT src.stack_id, src.best_id FROM (
                        SELECT i.stack_id, MIN(i.id) as best_id
                        FROM images i
                        WHERE i.stack_id IS NOT NULL
                          AND i.score_general = (
                              SELECT MAX(i2.score_general) FROM images i2 WHERE i2.stack_id = i.stack_id
                          )
                        GROUP BY i.stack_id
                    ) src
                    ON CONFLICT (stack_id) DO UPDATE SET rep_image_id = EXCLUDED.rep_image_id
                `);

                const countRows = await txQuery<{ cnt: number }>('SELECT COUNT(*) as "cnt" FROM stack_cache');
                const count = countRows[0]?.cnt || 0;
                console.log(`[DB] Stack cache rebuilt: ${count} stacks cached`);
                return count;
            });
        } finally {
            rebuildPromise = null;
            const nextContext = pendingAfterCurrent;
            pendingAfterCurrent = null;
            if (nextContext !== null) {
                console.log('[DB] Running queued stack cache rebuild...');
                // Do not await — start the next cycle without blocking the previous caller.
                rebuildStackCache(nextContext).catch(console.error);
            }
        }
    };

    rebuildPromise = runRebuild();
    return rebuildPromise;
}

export async function getStacks(options: StackQueryOptions = {}): Promise<unknown[]> {
    const { limit = 50, offset = 0, folderId, folderIds, minRating, colorLabel, keyword, sortBy = 'score_general', order = 'DESC' } = options;
    // `options.smartCover` is forwarded from the UI for future representative/cover selection; not used in SQL yet.

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
                i.thumbnail_path,
                i.thumbnail_path_win
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
                i.thumbnail_path,
                i.thumbnail_path_win
            FROM images i
            LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
                AND POSITION('/thumbnails/' IN fp.path) = 0
            ${whereClauseNonStack}
        ) a
        ORDER BY a.sort_value ${sortOrder}${pgNullsLastIfDesc(sortOrder)}, a.stack_key DESC
        ${paginationSql()}
    `;

    const rows = await query(sql, [...topParams, ...botParams, ...pagingParams(offset, limit)]);
    return mapRowsThumbnails(rows);
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
        whereParts.push(`EXISTS (
            SELECT 1 FROM image_keywords ik
            JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id
            WHERE ik.image_id = i.id
            AND (LOWER(kd.keyword_display) LIKE LOWER(?) OR LOWER(kd.keyword_norm) LIKE LOWER(?))
        )`);
        params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const allowedSortColumns = [
        'id', 'created_at', 'score_general', 'score_technical', 'score_aesthetic',
        'score_spaq', 'score_ava', 'score_liqe',
        'rating', 'file_name'
    ];
    const sortColumn = allowedSortColumns.includes(sortBy) ? `i.${sortBy}` : 'i.score_general';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

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
            i.thumbnail_path_win,
            i.stack_id
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}${pgNullsLastIfDesc(sortOrder)}
        ${paginationSql()}
    `;
    const rows = await query(sql, [...params, ...pagingParams(offset, limit)]);
    return mapRowsThumbnails(rows);
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
        SELECT ${countBigint()} as "count" FROM (
            SELECT COALESCE(i.stack_id, -i.id) as stack_key
            FROM images i
            ${whereClause}
            GROUP BY COALESCE(i.stack_id, -i.id)
        ) sub
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
    // The DB enforces FK constraints — child records in file_paths, image_keywords etc.
    // rely on ON DELETE CASCADE or need manual cleanup before this DELETE.

    try {
        await query('DELETE FROM images WHERE id = ?', [id]);
        console.log('[DB] Database record deleted');
        return true;
    } catch (e) {
        console.error('[DB] Delete failed:', e);
        return false;
    }
}

import { ScoredImageForBackup } from './types';

/**
 * Get all images with a general score >= minScore, including file path details.
 * Useful for planning backup.
 */
export async function getAllScoredImagesForBackup(minScore: number): Promise<ScoredImageForBackup[]> {
    const sql = `
        SELECT
            i.id,
            COALESCE(fp.path, i.file_path) as path,
            i.file_name,
            i.score_general as composite_score,
            i.image_hash,
            i.stack_id
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        WHERE i.score_general >= ?
        ORDER BY i.score_general DESC NULLS LAST
    `;
    const rows = await query(sql, [minScore]) as any[];
    return rows;
}

/**
 * Find pairs of similar images within a specific set of IDs using pgvector.
 * Returns pairs with similarity >= threshold.
 */
export async function getSimilarPairsInGroup(imageIds: number[], threshold: number): Promise<Array<{ id_a: number; id_b: number; similarity: number }>> {
    if (imageIds.length < 2) return [];

    // Use a temporary table or values list for larger sets of IDs to avoid param limits if needed,
    // but for backup filtering batches of a few hundreds/thousands should be fine with IN if partitioned.
    // However, Postgres ANY($1) is better. Since we use ? -> $n, we'll try IN (?, ?, ...) first
    // like the rest of the file does.
    
    const placeholders = imageIds.map(() => '?').join(', ');
    const sql = `
        SELECT 
            e1.image_id as id_a, 
            e2.image_id as id_b, 
            (1 - (e1.embedding <=> e2.embedding)) as similarity
        FROM image_embeddings e1
        JOIN image_embeddings e2 ON e1.image_id < e2.image_id
        WHERE e1.image_id IN (${placeholders}) 
          AND e2.image_id IN (${placeholders})
          AND (1 - (e1.embedding <=> e2.embedding)) >= ?
    `;

    // Flatten parameters: [ids..., ids..., threshold]
    const params = [...imageIds, ...imageIds, threshold];
    
    try {
        return await query<{ id_a: number; id_b: number; similarity: number }>(sql, params);
    } catch (e) {
        console.error('[DB] getSimilarPairsInGroup failed:', e);
        return [];
    }
}

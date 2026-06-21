import path from 'path';
import fs from 'fs';

import { getConfigPath, loadAppConfig } from './config';
import {
    attachModelSortOverlays,
    buildImageSortSql,
    buildStackSortExpressions,
} from './sortSql';
import { absolutizeThumbnailPath } from './thumbnailPathNormalize';
import { applyThumbnailPathRemaps } from './pathsRemap';
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

/**
 * Casts an expression to a calendar date for comparisons.
 * Both local `postgres` and `api` connectors run SQL against PostgreSQL (`::date` is valid).
 */
function castDate(expr: string): string {
    return `(${expr})::date`;
}

/** Shot time: embedded EXIF, then XMP sidecar (Lightroom / Bridge), then DB import time. */
const CAPTURE_TS = 'COALESCE(ex.date_time_original, ex.create_date, xm.create_date, i.created_at)';
const CAPTURE_TS_CEX = 'COALESCE(cex.date_time_original, cex.create_date, cxm.create_date, ci.created_at)';
const CAPTURE_TS_EI = 'COALESCE(e.date_time_original, e.create_date, xm.create_date, i.created_at)';
const CAPTURE_FALLBACK =
    '(ex.date_time_original IS NULL AND ex.create_date IS NULL AND xm.create_date IS NULL)';

/**
 * IMS overlay: per-image production (non-shadow) scores for the five models
 * that used to live on ``images``. Joined LEFT once per query and surfaced via
 * ``COALESCE`` with the typed columns so renderer types stay stable while the
 * columns are being retired (see backend migration 0016 and the legacy column
 * deprecation plan).
 *
 * Aliased so the same fragment can be used in both stack-cache rebuild and
 * per-image SELECTs. ``aliasId`` is the SQL expression that resolves to the
 * ``images.id`` of the row this overlay should match (e.g. ``i.id``).
 */
function imsOverlayJoin(alias: string, aliasId: string): string {
    return `
        LEFT JOIN (
            SELECT
                image_id,
                MAX(CASE WHEN model_name = 'spaq'    THEN COALESCE(normalized, raw_score) END) AS score_spaq,
                MAX(CASE WHEN model_name = 'ava'     THEN COALESCE(normalized, raw_score) END) AS score_ava,
                MAX(CASE WHEN model_name = 'liqe'    THEN COALESCE(normalized, raw_score) END) AS score_liqe,
                MAX(CASE WHEN model_name = 'topiq'   THEN COALESCE(normalized, raw_score) END) AS score_topiq,
                MAX(CASE WHEN model_name = 'arniqa'  THEN COALESCE(normalized, raw_score) END) AS score_arniqa,
                MAX(CASE WHEN model_name = 'clip_quality_v0' THEN COALESCE(normalized, raw_score) END) AS clip_quality_v0_score
            FROM image_model_scores
            WHERE model_name IN ('spaq', 'ava', 'liqe', 'topiq', 'arniqa', 'clip_quality_v0')
              AND is_shadow = FALSE
              AND status = 'success'
            GROUP BY image_id
        ) ${alias} ON ${alias}.image_id = ${aliasId}`;
}

/** Renderer-facing score projections from ``image_model_scores`` only. */
function imsOverlaySelect(alias: string): string {
    return [
        `${alias}.score_spaq AS score_spaq`,
        `${alias}.score_ava AS score_ava`,
        `${alias}.score_liqe AS score_liqe`,
        `${alias}.score_topiq AS score_topiq`,
        `${alias}.score_arniqa AS score_arniqa`,
        `${alias}.clip_quality_v0_score AS clip_quality_v0_score`,
    ].join(',\n            ');
}

/**
 * ORDER BY suffix after primary score (aliases ``ex`` = image_exif, ``i`` = images).
 * Must stay aligned with Postgres ``quality_tiebreak_order_sql(..., dialect='postgres')``
 * in sibling repo image-scoring-backend ``modules/quality_ranking.py``.
 */
export const QUALITY_TIEBREAK_ORDER_SQL_EX_I = `
, ex.iso ASC NULLS LAST
, CASE
    WHEN ex.exposure_time IS NULL THEN NULL
    WHEN POSITION('/' IN ex.exposure_time) > 0
      THEN CAST(SPLIT_PART(ex.exposure_time, '/', 1) AS DOUBLE PRECISION)
         / NULLIF(CAST(SPLIT_PART(ex.exposure_time, '/', 2) AS DOUBLE PRECISION), 0)
    ELSE CAST(ex.exposure_time AS DOUBLE PRECISION)
  END ASC NULLS LAST
, ex.date_time_original ASC NULLS LAST
, i.id ASC`;

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
    const remapped = applyThumbnailPathRemaps(raw, getPathsConfig());
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
    
    // Convert boolean flag from DB (Postgres returns boolean, SQLite might return 0/1)
    const rawRow = row as any;
    if (rawRow.is_capture_date_fallback !== undefined) {
        rawRow.is_capture_date_fallback = Boolean(rawRow.is_capture_date_fallback);
    }
    
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
 * Latest calendar shoot date (YYYY-MM-DD) from indexed EXIF / XMP under the destination tree.
 */
export async function getMaxIndexedCaptureDateUnderDestRoot(destRootWin: string): Promise<string | null> {
    const { destLike, wslLike } = syncDestinationPathLikeParams(destRootWin);
    const rows = await query<{ max_date: string | null }>(
        `SELECT MAX(${castDate('COALESCE(e.date_time_original, e.create_date, xm.create_date)')})::text AS max_date
         FROM images i
         LEFT JOIN image_exif e ON e.image_id = i.id
         LEFT JOIN image_xmp xm ON xm.image_id = i.id
         WHERE (i.file_path LIKE ? OR i.file_path LIKE ?)
           AND COALESCE(e.date_time_original, e.create_date, xm.create_date) IS NOT NULL`,
        [destLike, wslLike]
    );
    const v = rows[0]?.max_date;
    return v && String(v).trim() ? String(v).trim() : null;
}

/** Latest import date (YYYY-MM-DD) for any indexed image under the destination tree. */
export async function getMaxIndexedCreatedDateUnderDestRoot(destRootWin: string): Promise<string | null> {
    const { destLike, wslLike } = syncDestinationPathLikeParams(destRootWin);
    const rows = await query<{ max_date: string | null }>(
        `SELECT MAX(${castDate('i.created_at')})::text AS max_date FROM images i
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

function pushKeywordFilter(
    whereParts: string[],
    params: (string | number | null)[],
    keyword: string | undefined,
    imageIdRef: string,
    keywordExact?: boolean,
) {
    if (!keyword) return;

    if (keywordExact) {
        whereParts.push(`EXISTS (
            SELECT 1 FROM image_keywords ik
            JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id
            WHERE ik.image_id = ${imageIdRef}
            AND LOWER(kd.keyword_norm) = LOWER(?)
        )`);
        params.push(keyword);
        return;
    }

    whereParts.push(`EXISTS (
        SELECT 1 FROM image_keywords ik
        JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id
        WHERE ik.image_id = ${imageIdRef}
        AND (LOWER(kd.keyword_display) LIKE LOWER(?) OR LOWER(kd.keyword_norm) LIKE LOWER(?))
    )`);
    params.push(`%${keyword}%`, `%${keyword}%`);
}

function pushClipQualityFilter(
    whereParts: string[],
    params: (string | number | null)[],
    minClipQualityV0: number | undefined,
    imageIdRef: string,
) {
    if (minClipQualityV0 === undefined || minClipQualityV0 <= 0) return;

    whereParts.push(
        `EXISTS (SELECT 1 FROM image_model_scores ims_cq `
        + `WHERE ims_cq.image_id = ${imageIdRef} `
        + `AND ims_cq.model_name = 'clip_quality_v0' `
        + `AND ims_cq.is_shadow = FALSE `
        + `AND ims_cq.status = 'success' `
        + `AND COALESCE(ims_cq.normalized, ims_cq.raw_score) >= ?)`,
    );
    params.push(minClipQualityV0);
}

function pushImageAttributeFilters(
    whereParts: string[],
    params: (string | number | null)[],
    options: Pick<ImageQueryOptions, 'minRating' | 'colorLabel' | 'keyword' | 'keywordExact' | 'capturedDate' | 'minClipQualityV0'>,
    imageAlias = 'i',
) {
    const { minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 } = options;

    if (minRating !== undefined && minRating > 0) {
        whereParts.push(`${imageAlias}.rating >= ?`);
        params.push(minRating);
    }

    if (colorLabel) {
        whereParts.push(`${imageAlias}.label = ?`);
        params.push(colorLabel);
    }

    pushKeywordFilter(whereParts, params, keyword, `${imageAlias}.id`, keywordExact);

    if (capturedDate) {
        whereParts.push(`${castDate(CAPTURE_TS)} = ?`);
        params.push(capturedDate);
    }

    pushClipQualityFilter(whereParts, params, minClipQualityV0, `${imageAlias}.id`);
}

export async function getImageCount(options: ImageQueryOptions = {}): Promise<number> {
    const { folderId, folderIds, minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 } = options;
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

    pushKeywordFilter(whereParts, params, keyword, 'images.id', keywordExact);

    if (capturedDate) {
        whereParts.push(`EXISTS (
            SELECT 1 FROM images ci
            LEFT JOIN image_exif cex ON ci.id = cex.image_id
            LEFT JOIN image_xmp cxm ON ci.id = cxm.image_id
            WHERE ci.id = images.id
            AND ${castDate(CAPTURE_TS_CEX)} = ?
        )`);
        params.push(capturedDate);
    }

    pushClipQualityFilter(whereParts, params, minClipQualityV0, 'images.id');

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
    keywordExact?: boolean;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
    smartCover?: boolean;
    capturedDate?: string; // YYYY-MM-DD
    /** Minimum clip_quality_v0 (0–1) from image_model_scores. */
    minClipQualityV0?: number;
}

export async function getImages(options: ImageQueryOptions = {}): Promise<unknown[]> {
    const {
        limit = 50,
        offset = 0,
        folderId,
        folderIds,
        minRating,
        colorLabel,
        keyword,
        keywordExact,
        sortBy = 'score_general',
        order = 'DESC',
        capturedDate,
        minClipQualityV0,
    } = options;
    const params: (string | number | null)[] = [];
    const whereParts: string[] = [];

    pushFolderFilter(whereParts, params, folderId, folderIds);

    if (minRating !== undefined && minRating > 0) {
        whereParts.push('i.rating >= ?');
        params.push(minRating);
    }

    if (colorLabel) {
        whereParts.push('i.label = ?');
        params.push(colorLabel);
    }

    pushKeywordFilter(whereParts, params, keyword, 'i.id', keywordExact);

    if (capturedDate) {
        whereParts.push(`${castDate(CAPTURE_TS)} = ?`);
        params.push(capturedDate);
    }

    pushClipQualityFilter(whereParts, params, minClipQualityV0, 'i.id');

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const sortParts = buildImageSortSql(sortBy);
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
    const sortSql = sortParts.parsed.kind === 'meta' && sortParts.parsed.key === 'capture_date'
        ? CAPTURE_TS
        : sortParts.orderExpr || 'i.score_general';
    const selectExtra = sortParts.selectExtra ? `,\n            ${sortParts.selectExtra}` : '';
    const joinSql = sortParts.joinSql ? `\n        ${sortParts.joinSql}` : '';

    const sql = `
        SELECT
            i.id,
            COALESCE(fp.path, i.file_path) as file_path,
            i.file_name,
            i.score_general,
            i.score_technical,
            i.score_aesthetic,
            ${imsOverlaySelect('ims_legacy')},
            i.rating,
            i.label,
            i.created_at,
            i.thumbnail_path,
            i.thumbnail_path_win,
            ${CAPTURE_TS} as capture_date,
            ${CAPTURE_FALLBACK} as is_capture_date_fallback${selectExtra}
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        LEFT JOIN image_exif ex ON i.id = ex.image_id
        LEFT JOIN image_xmp xm ON i.id = xm.image_id${imsOverlayJoin('ims_legacy', 'i.id')}${joinSql}
        ${whereClause}
        ORDER BY ${sortSql} ${sortOrder}${pgNullsLastIfDesc(sortOrder)}, i.id DESC
        ${paginationSql()}
    `;
    const rows = await query(sql, [...params, ...sortParts.joinParams, ...pagingParams(offset, limit)]);
    attachModelSortOverlays(rows, sortParts.modelNameForOverlay);
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

export interface KeywordCloudEntry {
    keyword_norm: string;
    keyword_display: string;
    count: number;
}

const SPECIES_PREFIX = 'species:';
/** System marker when BioCLIP finds no species — hidden from tag cloud (see keywordFilters.ts). */
const BIRDS_SPECIES_EXHAUSTED_KEYWORD = 'birds:species-exhausted';

export async function getKeywordCloud(options: {
    kind: 'general' | 'species';
    limit?: number;
    folderId?: number;
}): Promise<KeywordCloudEntry[]> {
    const { kind, limit = 200, folderId } = options;
    const isSpecies = kind === 'species';
    const speciesPred = isSpecies ? 'kd.keyword_norm LIKE ?' : 'kd.keyword_norm NOT LIKE ?';
    const speciesArg = `${SPECIES_PREFIX}%`;

    const whereParts: string[] = [speciesPred, 'kd.keyword_norm <> ?'];
    const params: (string | number | null)[] = [speciesArg, BIRDS_SPECIES_EXHAUSTED_KEYWORD];

    let joinImages = '';
    if (folderId) {
        joinImages = 'JOIN images i ON ik.image_id = i.id';
        whereParts.push('i.folder_id = ?');
        params.push(folderId);
    }

    const whereSql = whereParts.join(' AND ');
    const safeLimit = Math.max(1, Math.min(limit, 1000));

    const sql = `
        SELECT kd.keyword_norm, kd.keyword_display,
               COUNT(DISTINCT ik.image_id) AS count
        FROM keywords_dim kd
        JOIN image_keywords ik ON kd.keyword_id = ik.keyword_id
        ${joinImages}
        WHERE ${whereSql}
        GROUP BY kd.keyword_id, kd.keyword_norm, kd.keyword_display
        ORDER BY count DESC
        LIMIT ?
    `;

    try {
        const rows = await query<{ keyword_norm: string; keyword_display: string; count: number }>(
            sql,
            [...params, safeLimit],
        );
        return rows.map((r) => ({
            keyword_norm: r.keyword_norm,
            keyword_display: r.keyword_display,
            count: Number(r.count) || 0,
        }));
    } catch (e) {
        console.error('[DB] getKeywordCloud failed:', e);
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
    model_version?: string;
    image_hash?: string;
    folder_id?: number;
    stack_id?: number;
    sub_stack_id?: number;
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
            ${imsOverlaySelect('ims_legacy')},
            (SELECT string_agg(kd.keyword_display, ', ') 
             FROM image_keywords ik 
             JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id 
             WHERE ik.image_id = i.id) as keywords,
            ${castTextExpr('i.title')} as title,
            ${castTextExpr('i.description')} as description,
            i.metadata,
            i.thumbnail_path,
            i.thumbnail_path_win,
            i.model_version,
            i.rating,
            i.label,
            i.image_hash,
            i.folder_id,
            i.stack_id,
            i.sub_stack_id,
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
        LEFT JOIN image_exif ex ON i.id = ex.image_id${imsOverlayJoin('ims_legacy', 'i.id')}
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
        return await runTransaction(async (tx) => {
            const cnt = await tx<{ c: string | number }>(
                `WITH RECURSIVE sub AS (
                    SELECT id FROM folders WHERE id = ?
                    UNION ALL
                    SELECT f.id FROM folders f INNER JOIN sub s ON f.parent_id = s.id
                )
                SELECT COUNT(*)::bigint AS c FROM images WHERE folder_id IN (SELECT id FROM sub)`,
                [id]
            );
            const imagesInSubtree = Number(cnt[0]?.c ?? 0);
            if (imagesInSubtree > 0) {
                return false;
            }

            const pathRows = await tx<{ path: string }>(
                `WITH RECURSIVE sub AS (
                    SELECT id, path FROM folders WHERE id = ?
                    UNION ALL
                    SELECT f.id, f.path FROM folders f INNER JOIN sub s ON f.parent_id = s.id
                )
                SELECT path FROM sub`,
                [id]
            );
            const paths = pathRows.map((r) => String(r.path || '')).filter(Boolean);
            try {
                if (paths.length > 0) {
                    const ph = paths.map(() => '?').join(', ');
                    await tx(`DELETE FROM cluster_progress WHERE folder_path IN (${ph})`, paths);
                }
            } catch {
                /* cluster_progress may be absent in older schemas */
            }

            await tx('DELETE FROM folders WHERE id = ?', [id]);
            return true;
        });
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

/**
 * True if this file was previously deleted and recorded in deleted_images (backend trigger).
 * Used to skip Sync/Import re-registration.
 */
export async function isImageDeleted(
    filePath: string,
    fileName: string,
    imageUuid: string | null
): Promise<boolean> {
    try {
        const norm = normalizePathForDb(filePath);
        const fwd = filePath.replace(/\\/g, '/');
        const pathCandidates = [...new Set([norm, fwd].filter(Boolean))];

        const conditions: string[] = [];
        const params: (string | null)[] = [];

        if (imageUuid && imageUuid.trim()) {
            conditions.push('(image_uuid = ? AND file_name = ?)');
            params.push(imageUuid.trim(), fileName);
        }
        for (const p of pathCandidates) {
            conditions.push('original_path = ?');
            params.push(p);
        }

        if (conditions.length === 0) return false;

        const rows = await query<{ x: number }>(
            `SELECT 1 AS x FROM deleted_images WHERE ${conditions.join(' OR ')} LIMIT 1`,
            params
        );
        return rows.length > 0;
    } catch (e) {
        console.warn('[DB] isImageDeleted failed (ensure backend migration for deleted_images):', e);
    }
    return false;
}

/**
 * Load deleted_images keys for Intelligent Backup manifest cleanup (original_id + image_hash).
 */
export async function getDeletedImageMatchSets(): Promise<{
    originalIds: Set<number>;
    hashes: Set<string>;
}> {
    const originalIds = new Set<number>();
    const hashes = new Set<string>();
    try {
        const rows = await query<{ original_id: number | null; image_hash: string | null }>(
            'SELECT original_id, image_hash FROM deleted_images'
        );
        for (const r of rows) {
            if (r.original_id != null && !Number.isNaN(Number(r.original_id))) {
                originalIds.add(Number(r.original_id));
            }
            const h = r.image_hash;
            if (h && String(h).trim()) hashes.add(String(h).trim());
        }
    } catch (e) {
        console.warn('[DB] getDeletedImageMatchSets failed:', e);
    }
    return { originalIds, hashes };
}

/**
 * Tombstone keys for the Sync skip check, preloaded once per run.
 * Mirrors the matching `isImageDeleted` performs — (image_uuid AND file_name) OR
 * original_path — but as in-memory sets to avoid a DB round-trip per candidate file.
 */
export async function getDeletedImageKeys(): Promise<{
    uuidNameKeys: Set<string>;
    originalPaths: Set<string>;
}> {
    const uuidNameKeys = new Set<string>();
    const originalPaths = new Set<string>();
    try {
        const rows = await query<{
            image_uuid: string | null;
            file_name: string | null;
            original_path: string | null;
        }>('SELECT image_uuid, file_name, original_path FROM deleted_images');
        for (const r of rows) {
            const uuid = r.image_uuid?.trim();
            if (uuid && r.file_name) {
                uuidNameKeys.add(`${uuid} ${r.file_name.toLowerCase()}`);
            }
            const op = r.original_path;
            if (op && op.trim()) {
                originalPaths.add(normalizePathForDb(op));
                originalPaths.add(op.replace(/\\/g, '/'));
            }
        }
    } catch (e) {
        console.warn('[DB] getDeletedImageKeys failed (ensure backend migration for deleted_images):', e);
    }
    return { uuidNameKeys, originalPaths };
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

/** `pipeline_phases.code` values for post-import processing (matches API score/tag/cluster phases). */
export const SCHEDULE_PENDING_PHASE_CODES = ['metadata', 'scoring', 'culling', 'keywords'] as const;
export type SchedulePendingPhaseCode = (typeof SCHEDULE_PENDING_PHASE_CODES)[number];

/** Phase codes surfaced in `getImagePhaseStatuses`, ordered for UI display. */
export const ALL_PIPELINE_PHASE_CODES = ['indexing', 'metadata', 'scoring', 'culling', 'keywords'] as const;
export type PipelinePhaseCode = (typeof ALL_PIPELINE_PHASE_CODES)[number];
export type PipelinePhaseStatus =
    | 'not_started'
    | 'running'
    | 'done'
    | 'skipped'
    | 'failed';

export interface ImagePhaseStatusRow {
    code: PipelinePhaseCode;
    status: PipelinePhaseStatus;
    started_at: string | null;
    finished_at: string | null;
    updated_at: string | null;
    last_error: string | null;
    attempt_count: number;
}

/**
 * Return one row per known pipeline phase for `imageId`. Phases without an
 * `image_phase_status` row default to `not_started` so the UI can render the
 * full pipeline regardless of whether the backend has touched the image yet.
 */
export async function getImagePhaseStatuses(imageId: number): Promise<ImagePhaseStatusRow[]> {
    const codePlaceholders = ALL_PIPELINE_PHASE_CODES.map(() => '?').join(', ');
    const rows = await query<{
        code: string;
        status: string | null;
        started_at: string | null;
        finished_at: string | null;
        updated_at: string | null;
        last_error: string | null;
        attempt_count: number | null;
    }>(
        `SELECT
            pp.code,
            ips.status,
            ips.started_at,
            ips.finished_at,
            ips.updated_at,
            ips.last_error,
            ips.attempt_count
        FROM pipeline_phases pp
        LEFT JOIN image_phase_status ips
            ON ips.phase_id = pp.id AND ips.image_id = ?
        WHERE pp.code IN (${codePlaceholders})`,
        [imageId, ...ALL_PIPELINE_PHASE_CODES]
    );
    const byCode = new Map<string, ImagePhaseStatusRow>();
    for (const r of rows) {
        byCode.set(r.code, {
            code: r.code as PipelinePhaseCode,
            status: (r.status ?? 'not_started') as PipelinePhaseStatus,
            started_at: r.started_at,
            finished_at: r.finished_at,
            updated_at: r.updated_at,
            last_error: r.last_error,
            attempt_count: r.attempt_count ?? 0,
        });
    }
    return ALL_PIPELINE_PHASE_CODES.map((code) =>
        byCode.get(code) ?? {
            code,
            status: 'not_started',
            started_at: null,
            finished_at: null,
            updated_at: null,
            last_error: null,
            attempt_count: 0,
        }
    );
}

async function invalidateFolderAggregatesForImageIds(imageIds: number[]): Promise<void> {
    if (imageIds.length === 0) {
        return;
    }
    const unique = [...new Set(imageIds)];
    const ph = unique.map(() => '?').join(', ');
    const rows = await query<{ folder_id: number | null }>(
        `SELECT DISTINCT folder_id FROM images WHERE id IN (${ph})`,
        unique
    );
    const allAncestorIds = new Set<number>();
    for (const r of rows) {
        let folderId: number | null = r.folder_id;
        const seen = new Set<number>();
        while (folderId != null && !seen.has(folderId)) {
            seen.add(folderId);
            allAncestorIds.add(folderId);
            const parentRows = await query<{ parent_id: number | null }>(
                'SELECT parent_id FROM folders WHERE id = ?',
                [folderId]
            );
            folderId = parentRows[0]?.parent_id ?? null;
        }
    }
    if (allAncestorIds.size === 0) {
        return;
    }
    const ids = [...allAncestorIds];
    const ph2 = ids.map(() => '?').join(', ');
    await query(`UPDATE folders SET phase_agg_dirty = 1 WHERE id IN (${ph2})`, ids);
}

/**
 * Insert `not_started` rows for the given phases so the backend can pick them up later.
 * Uses ON CONFLICT DO NOTHING so existing done/running rows are preserved.
 */
export async function markImagePhasesPending(
    imageIds: number[],
    phaseCodes: readonly SchedulePendingPhaseCode[] = SCHEDULE_PENDING_PHASE_CODES
): Promise<void> {
    if (imageIds.length === 0 || phaseCodes.length === 0) {
        return;
    }
    const codePlaceholders = phaseCodes.map(() => '?').join(', ');
    const phaseRows = await query<{ id: number; code: string }>(
        `SELECT id, code FROM pipeline_phases WHERE code IN (${codePlaceholders})`,
        [...phaseCodes]
    );
    const phaseIds = phaseRows.map((r) => r.id);
    if (phaseIds.length === 0) {
        console.warn('[DB] markImagePhasesPending: no pipeline_phases rows for codes', phaseCodes);
        return;
    }

    const CHUNK_IMAGES = 40;
    for (let i = 0; i < imageIds.length; i += CHUNK_IMAGES) {
        const chunk = imageIds.slice(i, i + CHUNK_IMAGES);
        const valueParts: string[] = [];
        const params: QueryParam[] = [];
        for (const imageId of chunk) {
            for (const phaseId of phaseIds) {
                valueParts.push('(?, ?, \'not_started\', NULL, NULL, 0, NULL, NULL, NULL, CURRENT_TIMESTAMP, NULL, NULL)');
                params.push(imageId, phaseId);
            }
        }
        if (valueParts.length === 0) {
            continue;
        }
        await query(
            `INSERT INTO image_phase_status (
                image_id, phase_id, status, app_version, executor_version,
                attempt_count, last_error, started_at, finished_at, updated_at, skip_reason, skipped_by
            ) VALUES ${valueParts.join(', ')}
            ON CONFLICT (image_id, phase_id) DO NOTHING`,
            params
        );
    }
    await invalidateFolderAggregatesForImageIds(imageIds);
}

/**
 * Mark post-import phases `not_started` for every image in a folder (by `folders.path`).
 * Used when the API registered imports but we have no per-image id list for fallback.
 */
export async function markFolderImagePhasesPending(folderPath: string): Promise<number> {
    const normalized = normalizePathForDb(folderPath);
    const folderRows = await query<{ id: number }>('SELECT id FROM folders WHERE path = ?', [normalized]);
    if (folderRows.length === 0) {
        return 0;
    }
    const folderId = folderRows[0].id;
    const imageRows = await query<{ id: number }>('SELECT id FROM images WHERE folder_id = ?', [folderId]);
    const ids = imageRows.map((r) => r.id);
    await markImagePhasesPending(ids);
    return ids.length;
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
                    INSERT INTO image_keywords (image_id, keyword_id, source, confidence, relevance_weight)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (image_id, keyword_id) DO UPDATE
                        SET source = EXCLUDED.source, confidence = EXCLUDED.confidence,
                            relevance_weight = EXCLUDED.relevance_weight
                `, [imageId, kwId, 'electron_ui', 1.0, 1.0]);
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

                // Populate from images table - only for actual stacks (stack_id IS NOT NULL).
                // Per-model min/max overlay legacy typed columns with image_model_scores
                // (backend migration 0016) so the cache stays correct while the typed
                // columns are being retired.
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
                        MIN(ims_legacy.score_spaq),
                        MAX(ims_legacy.score_spaq),
                        MIN(ims_legacy.score_ava),
                        MAX(ims_legacy.score_ava),
                        MIN(ims_legacy.score_liqe),
                        MAX(ims_legacy.score_liqe),
                        MIN(i.rating), MAX(i.rating),
                        MIN(i.created_at), MAX(i.created_at)
                    FROM images i${imsOverlayJoin('ims_legacy', 'i.id')}
                    WHERE i.stack_id IS NOT NULL
                    GROUP BY i.stack_id
                `;

                await txQuery(sql);

                // rep_image_id: best score_general per stack, then EXIF tie-break (see QUALITY_TIEBREAK_ORDER_SQL_EX_I).
                await txQuery(`
                    INSERT INTO stack_cache (stack_id, rep_image_id)
                    SELECT DISTINCT ON (i.stack_id)
                        i.stack_id,
                        i.id
                    FROM images i
                    LEFT JOIN image_exif ex ON ex.image_id = i.id
                    WHERE i.stack_id IS NOT NULL
                    ORDER BY i.stack_id,
                             i.score_general DESC NULLS LAST
                             ${QUALITY_TIEBREAK_ORDER_SQL_EX_I}
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
    const { limit = 50, offset = 0, folderId, folderIds, minRating, colorLabel, keyword, keywordExact, sortBy = 'score_general', order = 'DESC', capturedDate, minClipQualityV0 } = options;
    // `options.smartCover` is forwarded from the UI for future representative/cover selection; not used in SQL yet.

    await ensureStackCacheTable();

    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
    const stackSort = buildStackSortExpressions(sortBy, sortOrder, CAPTURE_TS);
    const cacheSortCol = stackSort.cacheSortCol;
    const nonStackSortCol = stackSort.nonStackSortCol;
    const nonStackJoinSql = stackSort.joinSqlNonStack ? `\n            ${stackSort.joinSqlNonStack}` : '';
    const nonStackSelectExtra = stackSort.selectExtraNonStack ? `,\n                ${stackSort.selectExtraNonStack}` : '';

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
        const kwPred = keywordExact
            ? 'LOWER(kd.keyword_norm) = LOWER(?)'
            : '(LOWER(kd.keyword_display) LIKE LOWER(?) OR LOWER(kd.keyword_norm) LIKE LOWER(?))';
        wherePartsCache.push(`EXISTS (
            SELECT 1 FROM images ci
            JOIN image_keywords ik ON ik.image_id = ci.id
            JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id
            WHERE ci.stack_id = sc.stack_id
            AND ${kwPred}
        )`);
        if (keywordExact) {
            topParams.push(keyword);
        } else {
            topParams.push(`%${keyword}%`, `%${keyword}%`);
        }

        pushKeywordFilter(wherePartsNonStack, botParams, keyword, 'i.id', keywordExact);
    }

    if (capturedDate) {
        // Filter stacks where at least one member image has this capture date
        wherePartsCache.push(`EXISTS (
            SELECT 1 FROM images ci
            LEFT JOIN image_exif cex ON ci.id = cex.image_id
            LEFT JOIN image_xmp cxm ON ci.id = cxm.image_id
            WHERE ci.stack_id = sc.stack_id
            AND ${castDate(CAPTURE_TS_CEX)} = ?
        )`);
        topParams.push(capturedDate);

        wherePartsNonStack.push(`${castDate(CAPTURE_TS)} = ?`);
        botParams.push(capturedDate);
    }

    if (minClipQualityV0 !== undefined && minClipQualityV0 > 0) {
        wherePartsCache.push(`EXISTS (
            SELECT 1 FROM images ci
            WHERE ci.stack_id = sc.stack_id
            AND EXISTS (
                SELECT 1 FROM image_model_scores ims_cq
                WHERE ims_cq.image_id = ci.id
                AND ims_cq.model_name = 'clip_quality_v0'
                AND ims_cq.is_shadow = FALSE
                AND ims_cq.status = 'success'
                AND COALESCE(ims_cq.normalized, ims_cq.raw_score) >= ?
            )
        )`);
        topParams.push(minClipQualityV0);
        pushClipQualityFilter(wherePartsNonStack, botParams, minClipQualityV0, 'i.id');
    }

    const whereClauseCache = wherePartsCache.length > 0 ? 'WHERE ' + wherePartsCache.join(' AND ') : '';
    const whereClauseNonStack = 'WHERE ' + wherePartsNonStack.join(' AND ');

    const buildSql = (includePickStatus: boolean) => {
        const stackPickStatusExpr = effectivePickStatusExpr(includePickStatus, 'ci');
        const repPickStatusExpr = effectivePickStatusExpr(includePickStatus, 'i');
        const stackPickStatsJoin = `
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE ${stackPickStatusExpr} = 1) AS pick_count,
                    COUNT(*) FILTER (WHERE ${stackPickStatusExpr} = -1) AS reject_count
                FROM images ci
                WHERE ci.stack_id = sc.stack_id
            ) pick_stats ON TRUE`;
        const nonStackPickCountExpr = `CASE WHEN ${repPickStatusExpr} = 1 THEN 1 ELSE 0 END`;
        const nonStackRejectCountExpr = `CASE WHEN ${repPickStatusExpr} = -1 THEN 1 ELSE 0 END`;

        return `
        SELECT * FROM (
            SELECT
                sc.stack_id,
                CAST(sc.stack_id AS BIGINT) as stack_key,
                sc.image_count,
                ${cacheSortCol} as sort_value,
                sc.rep_image_id,
                pick_stats.pick_count AS pick_count,
                pick_stats.reject_count AS reject_count,
                ${imagePickStatusSelect(includePickStatus, 'i')},
                i.id,
                COALESCE(fp.path, i.file_path) as file_path,
                i.file_name,
                i.score_general,
                i.score_technical,
                i.score_aesthetic,
                ${imsOverlaySelect('ims_legacy')},
                i.rating,
                i.label,
                i.created_at,
                i.thumbnail_path,
                i.thumbnail_path_win,
                ${CAPTURE_TS} as capture_date,
                ${CAPTURE_FALLBACK} as is_capture_date_fallback${nonStackSelectExtra}
            FROM stack_cache sc
            JOIN images i ON i.id = sc.rep_image_id
            LEFT JOIN image_exif ex ON i.id = ex.image_id
            LEFT JOIN image_xmp xm ON i.id = xm.image_id
            LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
                AND POSITION('/thumbnails/' IN fp.path) = 0${imsOverlayJoin('ims_legacy', 'i.id')}${stackPickStatsJoin}${nonStackJoinSql}
            ${whereClauseCache}

            UNION ALL

            SELECT
                i.stack_id,
                CAST(-i.id AS BIGINT) as stack_key,
                1 as image_count,
                ${nonStackSortCol} as sort_value,
                i.id as rep_image_id,
                ${nonStackPickCountExpr} AS pick_count,
                ${nonStackRejectCountExpr} AS reject_count,
                ${imagePickStatusSelect(includePickStatus, 'i')},
                i.id,
                COALESCE(fp.path, i.file_path) as file_path,
                i.file_name,
                i.score_general,
                i.score_technical,
                i.score_aesthetic,
                ${imsOverlaySelect('ims_legacy')},
                i.rating,
                i.label,
                i.created_at,
                i.thumbnail_path,
                i.thumbnail_path_win,
                ${CAPTURE_TS} as capture_date,
                ${CAPTURE_FALLBACK} as is_capture_date_fallback${nonStackSelectExtra}
            FROM images i
            LEFT JOIN image_exif ex ON i.id = ex.image_id
            LEFT JOIN image_xmp xm ON i.id = xm.image_id
            LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
                AND POSITION('/thumbnails/' IN fp.path) = 0${imsOverlayJoin('ims_legacy', 'i.id')}${nonStackJoinSql}
            ${whereClauseNonStack}
        ) a
        ORDER BY a.sort_value ${sortOrder}${pgNullsLastIfDesc(sortOrder)}, a.stack_key DESC
        ${paginationSql()}
    `;
    };

    const rows = await queryWithOptionalPickStatus(buildSql, [...topParams, ...botParams, ...pagingParams(offset, limit)]);
    attachModelSortOverlays(rows, stackSort.modelNameForOverlay);
    return mapRowsThumbnails(rows);
}

export async function getImagesByStack(stackId: number | null, options: ImageQueryOptions = {}): Promise<unknown[]> {
    const { limit = 200, offset = 0, folderId, minRating, colorLabel, keyword, keywordExact, sortBy = 'score_general', order = 'DESC', capturedDate, minClipQualityV0 } = options;
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

    pushKeywordFilter(whereParts, params, keyword, 'i.id', keywordExact);

    if (capturedDate) {
        whereParts.push(`${castDate(CAPTURE_TS)} = ?`);
        params.push(capturedDate);
    }

    pushClipQualityFilter(whereParts, params, minClipQualityV0, 'i.id');

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const sortParts = buildImageSortSql(sortBy);
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
    const sortColumn = sortParts.parsed.kind === 'meta' && sortParts.parsed.key === 'capture_date'
        ? CAPTURE_TS
        : sortParts.orderExpr || 'i.score_general';
    const selectExtra = sortParts.selectExtra ? `,\n            ${sortParts.selectExtra}` : '';
    const joinSql = sortParts.joinSql ? `\n        ${sortParts.joinSql}` : '';

    const buildSql = (includePickStatus: boolean) => `
        SELECT
            i.id,
            COALESCE(fp.path, i.file_path) as file_path,
            i.file_name,
            i.score_general,
            i.score_technical,
            i.score_aesthetic,
            ${imsOverlaySelect('ims_legacy')},
            i.rating,
            i.label,
            i.created_at,
            i.thumbnail_path,
            i.thumbnail_path_win,
            i.stack_id,
            i.sub_stack_id,
            ${imagePickStatusSelect(includePickStatus, 'i')},
            ${CAPTURE_TS} as capture_date,
            ${CAPTURE_FALLBACK} as is_capture_date_fallback${selectExtra}
        FROM images i
        LEFT JOIN image_exif ex ON i.id = ex.image_id
        LEFT JOIN image_xmp xm ON i.id = xm.image_id
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0${imsOverlayJoin('ims_legacy', 'i.id')}${joinSql}
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}${pgNullsLastIfDesc(sortOrder)}${QUALITY_TIEBREAK_ORDER_SQL_EX_I}
        ${paginationSql()}
    `;
    const rows = await queryWithOptionalPickStatus(buildSql, [...params, ...sortParts.joinParams, ...pagingParams(offset, limit)]);
    attachModelSortOverlays(rows, sortParts.modelNameForOverlay);
    return mapRowsThumbnails(rows);
}

export interface SubStackRow {
    // Representative image id for the card; use sub_stack_id for the persisted sub-stack id.
    id: number;
    sub_stack_id: number | null;
    sub_stack_key?: number;
    stack_id: number;
    file_path: string;
    file_name: string;
    score_general: number;
    score_technical: number;
    score_aesthetic: number;
    score_spaq: number;
    score_ava: number;
    score_liqe: number;
    score_topiq?: number;
    score_arniqa?: number;
    rating: number;
    label: string | null;
    pick_status?: number | null;
    thumbnail_path?: string;
    name?: string | null;
    best_image_id?: number | null;
    level1_space?: string | null;
    level2_visual_space?: string | null;
    level2_semantic_space?: string | null;
    policy_version?: string | null;
    image_count?: number;
    pick_count?: number;
    reject_count?: number;
    created_at?: string;
    is_ungrouped_sub_stack?: boolean;
}

let hasWarnedMissingSubStackSchema = false;

function isMissingSubStackSchemaError(error: unknown): boolean {
    const e = error as { code?: string; message?: string };
    const msg = String(e?.message ?? error).toLowerCase();
    const missingObject = msg.includes('does not exist')
        || msg.includes('no such table')
        || msg.includes('no such column')
        || msg.includes('unknown column');
    const subStackObject = msg.includes('sub_stacks') || msg.includes('sub_stack_id');
    return (e?.code === '42P01' && subStackObject)
        || (e?.code === '42703' && subStackObject)
        || (missingObject && subStackObject);
}

function warnMissingSubStackSchema(error: unknown): void {
    if (hasWarnedMissingSubStackSchema) return;
    hasWarnedMissingSubStackSchema = true;
    console.warn('[DB] Sub-stack schema not available; falling back to flat stack view.', error);
}

let hasWarnedMissingPickStatusColumn = false;

function isMissingPickStatusColumnError(error: unknown): boolean {
    const e = error as { code?: string; message?: string };
    const msg = String(e?.message ?? error).toLowerCase();
    const missingColumn = msg.includes('pick_status')
        && (msg.includes('does not exist') || msg.includes('no such column') || msg.includes('unknown column'));
    return (e?.code === '42703' && msg.includes('pick_status')) || missingColumn;
}

function warnMissingPickStatusColumn(error: unknown): void {
    if (hasWarnedMissingPickStatusColumn) return;
    hasWarnedMissingPickStatusColumn = true;
    console.warn('[DB] images.pick_status not available; hiding pick/reject stack badges.', error);
}

function imagePickStatusSelect(includePickStatus: boolean, imageAlias = 'i'): string {
    return `${effectivePickStatusExpr(includePickStatus, imageAlias)} AS pick_status`;
}

function effectivePickStatusExpr(includePickStatus: boolean, imageAlias = 'i'): string {
    const rawStatus = includePickStatus ? `${imageAlias}.pick_status` : 'NULL';
    return `CASE
        WHEN ${rawStatus} = 1 THEN 1
        WHEN ${rawStatus} = -1 THEN -1
        WHEN COALESCE(${rawStatus}, 0) = 0 AND ${imageAlias}.label = 'Red' THEN -1
        WHEN COALESCE(${rawStatus}, 0) = 0 AND ${imageAlias}.label IN ('Green', 'Blue', 'Purple') THEN 1
        ELSE COALESCE(${rawStatus}, 0)
    END`;
}

async function queryWithOptionalPickStatus<T>(
    buildSql: (includePickStatus: boolean) => string,
    params: QueryParam[],
): Promise<T[]> {
    try {
        return await query<T>(buildSql(true), params);
    } catch (e) {
        if (!isMissingPickStatusColumnError(e)) {
            throw e;
        }
        warnMissingPickStatusColumn(e);
        return await query<T>(buildSql(false), params);
    }
}

export async function getSubstacksForStack(stackId: number, options: ImageQueryOptions = {}): Promise<SubStackRow[]> {
    const { minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 } = options;
    const params: (string | number | null)[] = [stackId];
    const whereParts: string[] = [
        'i.stack_id = ?',
        'i.sub_stack_id IS NOT NULL',
    ];

    pushImageAttributeFilters(whereParts, params, { minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 });

    const filteredWhere = whereParts.join(' AND ');
    const buildSql = (includePickStatus: boolean) => `
        WITH filtered_members AS (
            SELECT i.id, i.sub_stack_id, ${imagePickStatusSelect(includePickStatus, 'i')}
            FROM images i
            LEFT JOIN image_exif ex ON i.id = ex.image_id
            LEFT JOIN image_xmp xm ON i.id = xm.image_id
            WHERE ${filteredWhere}
        ),
        member_counts AS (
            SELECT
                sub_stack_id,
                ${countBigint()} AS image_count,
                SUM(CASE WHEN pick_status = 1 THEN 1 ELSE 0 END)::bigint AS pick_count,
                SUM(CASE WHEN pick_status = -1 THEN 1 ELSE 0 END)::bigint AS reject_count
            FROM filtered_members
            GROUP BY sub_stack_id
        )
        SELECT
               rep.id,
               ss.id AS sub_stack_id,
               CAST(ss.id AS BIGINT) AS sub_stack_key,
               ss.stack_id,
               ss.name,
               ss.best_image_id,
               ss.level1_space,
               ss.level2_visual_space,
               ss.level2_semantic_space,
               ss.policy_version,
               ss.created_at,
               FALSE AS is_ungrouped_sub_stack,
               mc.image_count,
               mc.pick_count,
               mc.reject_count,
               rep.file_path,
               rep.file_name,
               rep.score_general,
               rep.score_technical,
               rep.score_aesthetic,
               rep.score_spaq,
               rep.score_ava,
               rep.score_liqe,
               rep.score_topiq,
               rep.score_arniqa,
               rep.rating,
               rep.label,
               rep.pick_status,
               rep.thumbnail_path,
               rep.thumbnail_path_win,
               rep.capture_date,
               rep.is_capture_date_fallback
        FROM sub_stacks ss
        JOIN member_counts mc ON mc.sub_stack_id = ss.id
        -- PostgreSQL LATERAL lets each sub-stack choose its own best filtered representative image.
        JOIN LATERAL (
            SELECT
                i.id,
                COALESCE(fp.path, i.file_path) as file_path,
                i.file_name,
                i.score_general,
                i.score_technical,
                i.score_aesthetic,
                ${imsOverlaySelect('ims_legacy')},
                i.rating,
                i.label,
                ${imagePickStatusSelect(includePickStatus, 'i')},
                i.thumbnail_path,
                i.thumbnail_path_win,
                ${CAPTURE_TS} as capture_date,
                ${CAPTURE_FALLBACK} as is_capture_date_fallback
            FROM images i
            JOIN filtered_members fm ON fm.id = i.id
            LEFT JOIN image_exif ex ON i.id = ex.image_id
            LEFT JOIN image_xmp xm ON i.id = xm.image_id
            LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
                AND POSITION('/thumbnails/' IN fp.path) = 0${imsOverlayJoin('ims_legacy', 'i.id')}
            WHERE i.sub_stack_id = ss.id
            ORDER BY
                CASE WHEN i.id = ss.best_image_id THEN 0 ELSE 1 END,
                i.score_general DESC NULLS LAST
                ${QUALITY_TIEBREAK_ORDER_SQL_EX_I}
            LIMIT 1
        ) rep ON TRUE
        WHERE ss.stack_id = ?
        ORDER BY ss.id
    `;
    try {
        const rows = await queryWithOptionalPickStatus<SubStackRow>(buildSql, [...params, stackId]);
        const subStacks = mapRowsThumbnails(rows) as SubStackRow[];
        if (subStacks.length === 0) {
            return subStacks;
        }

        const ungroupedCard = await getUngroupedSubStackCardForStack(stackId, options);
        return ungroupedCard ? [...subStacks, ungroupedCard] : subStacks;
    } catch (e) {
        if (isMissingSubStackSchemaError(e)) {
            warnMissingSubStackSchema(e);
            return [];
        }
        throw e;
    }
}

async function getUngroupedSubStackCardForStack(stackId: number, options: ImageQueryOptions = {}): Promise<SubStackRow | null> {
    const { minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 } = options;
    const params: (string | number | null)[] = [stackId];
    const whereParts: string[] = [
        'i.stack_id = ?',
        'i.sub_stack_id IS NULL',
    ];

    pushImageAttributeFilters(whereParts, params, { minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 });

    const buildSql = (includePickStatus: boolean) => `
        WITH filtered_orphans AS (
            SELECT i.id, ${imagePickStatusSelect(includePickStatus, 'i')}
            FROM images i
            LEFT JOIN image_exif ex ON i.id = ex.image_id
            LEFT JOIN image_xmp xm ON i.id = xm.image_id
            WHERE ${whereParts.join(' AND ')}
        ),
        orphan_count AS (
            SELECT
                ${countBigint()} AS image_count,
                SUM(CASE WHEN pick_status = 1 THEN 1 ELSE 0 END)::bigint AS pick_count,
                SUM(CASE WHEN pick_status = -1 THEN 1 ELSE 0 END)::bigint AS reject_count
            FROM filtered_orphans
        )
        SELECT
               rep.id,
               CAST(NULL AS BIGINT) AS sub_stack_id,
               CAST(NULL AS BIGINT) AS sub_stack_key,
               CAST(? AS BIGINT) AS stack_id,
               'Ungrouped' AS name,
               CAST(NULL AS BIGINT) AS best_image_id,
               CAST(NULL AS TEXT) AS level1_space,
               CAST(NULL AS TEXT) AS level2_visual_space,
               CAST(NULL AS TEXT) AS level2_semantic_space,
               CAST(NULL AS TEXT) AS policy_version,
               CAST(NULL AS TEXT) AS created_at,
               TRUE AS is_ungrouped_sub_stack,
               oc.image_count,
               oc.pick_count,
               oc.reject_count,
               rep.file_path,
               rep.file_name,
               rep.score_general,
               rep.score_technical,
               rep.score_aesthetic,
               rep.score_spaq,
               rep.score_ava,
               rep.score_liqe,
               rep.score_topiq,
               rep.score_arniqa,
               rep.rating,
               rep.label,
               rep.pick_status,
               rep.thumbnail_path,
               rep.thumbnail_path_win,
               rep.capture_date,
               rep.is_capture_date_fallback
        FROM orphan_count oc
        JOIN LATERAL (
            SELECT
                i.id,
                COALESCE(fp.path, i.file_path) as file_path,
                i.file_name,
                i.score_general,
                i.score_technical,
                i.score_aesthetic,
                ${imsOverlaySelect('ims_legacy')},
                i.rating,
                i.label,
                ${imagePickStatusSelect(includePickStatus, 'i')},
                i.thumbnail_path,
                i.thumbnail_path_win,
                ${CAPTURE_TS} as capture_date,
                ${CAPTURE_FALLBACK} as is_capture_date_fallback
            FROM images i
            JOIN filtered_orphans fo ON fo.id = i.id
            LEFT JOIN image_exif ex ON i.id = ex.image_id
            LEFT JOIN image_xmp xm ON i.id = xm.image_id
            LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
                AND POSITION('/thumbnails/' IN fp.path) = 0${imsOverlayJoin('ims_legacy', 'i.id')}
            ORDER BY i.score_general DESC NULLS LAST${QUALITY_TIEBREAK_ORDER_SQL_EX_I}
            LIMIT 1
        ) rep ON TRUE
        WHERE oc.image_count > 0
    `;

    const rows = await queryWithOptionalPickStatus<SubStackRow>(buildSql, [...params, stackId]);
    const mapped = mapRowsThumbnails(rows) as SubStackRow[];
    return mapped[0] ?? null;
}

export async function getImagesBySubStack(subStackId: number, options: ImageQueryOptions = {}): Promise<unknown[]> {
    const {
        limit = 200,
        offset = 0,
        minRating,
        colorLabel,
        keyword,
        keywordExact,
        sortBy = 'score_general',
        order = 'DESC',
        capturedDate,
        minClipQualityV0,
    } = options;
    const params: (string | number | null)[] = [subStackId];
    const whereParts = ['i.sub_stack_id = ?'];
    pushImageAttributeFilters(whereParts, params, { minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 });
    const whereClause = 'WHERE ' + whereParts.join(' AND ');

    const sortParts = buildImageSortSql(sortBy);
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
    const sortColumn = sortParts.parsed.kind === 'meta' && sortParts.parsed.key === 'capture_date'
        ? CAPTURE_TS
        : sortParts.orderExpr || 'i.score_general';
    const selectExtra = sortParts.selectExtra ? `,\n            ${sortParts.selectExtra}` : '';
    const joinSql = sortParts.joinSql ? `\n        ${sortParts.joinSql}` : '';

    const buildSql = (includePickStatus: boolean) => `
        SELECT
            i.id,
            COALESCE(fp.path, i.file_path) as file_path,
            i.file_name,
            i.score_general,
            i.score_technical,
            i.score_aesthetic,
            ${imsOverlaySelect('ims_legacy')},
            i.rating,
            i.label,
            i.created_at,
            i.thumbnail_path,
            i.thumbnail_path_win,
            i.stack_id,
            i.sub_stack_id,
            ${imagePickStatusSelect(includePickStatus, 'i')},
            ${CAPTURE_TS} as capture_date,
            ${CAPTURE_FALLBACK} as is_capture_date_fallback${selectExtra}
        FROM images i
        LEFT JOIN image_exif ex ON i.id = ex.image_id
        LEFT JOIN image_xmp xm ON i.id = xm.image_id
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0${imsOverlayJoin('ims_legacy', 'i.id')}${joinSql}
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}${pgNullsLastIfDesc(sortOrder)}${QUALITY_TIEBREAK_ORDER_SQL_EX_I}
        ${paginationSql()}
    `;
    try {
        const rows = await queryWithOptionalPickStatus(buildSql, [...params, ...sortParts.joinParams, ...pagingParams(offset, limit)]);
        attachModelSortOverlays(rows, sortParts.modelNameForOverlay);
        return mapRowsThumbnails(rows);
    } catch (e) {
        if (isMissingSubStackSchemaError(e)) {
            warnMissingSubStackSchema(e);
            return [];
        }
        throw e;
    }
}

export async function getImagesByStackUngrouped(stackId: number, options: ImageQueryOptions = {}): Promise<unknown[]> {
    const {
        limit = 200,
        offset = 0,
        minRating,
        colorLabel,
        keyword,
        keywordExact,
        sortBy = 'score_general',
        order = 'DESC',
        capturedDate,
        minClipQualityV0,
    } = options;
    const params: (string | number | null)[] = [stackId];
    const whereParts = ['i.stack_id = ?', 'i.sub_stack_id IS NULL'];
    pushImageAttributeFilters(whereParts, params, { minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 });
    const whereClause = 'WHERE ' + whereParts.join(' AND ');

    const sortParts = buildImageSortSql(sortBy);
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
    const sortColumn = sortParts.parsed.kind === 'meta' && sortParts.parsed.key === 'capture_date'
        ? CAPTURE_TS
        : sortParts.orderExpr || 'i.score_general';
    const selectExtra = sortParts.selectExtra ? `,\n            ${sortParts.selectExtra}` : '';
    const joinSql = sortParts.joinSql ? `\n        ${sortParts.joinSql}` : '';

    const buildSql = (includePickStatus: boolean) => `
        SELECT
            i.id,
            COALESCE(fp.path, i.file_path) as file_path,
            i.file_name,
            i.score_general,
            i.score_technical,
            i.score_aesthetic,
            ${imsOverlaySelect('ims_legacy')},
            i.rating,
            i.label,
            i.created_at,
            i.thumbnail_path,
            i.thumbnail_path_win,
            i.stack_id,
            i.sub_stack_id,
            ${imagePickStatusSelect(includePickStatus, 'i')},
            ${CAPTURE_TS} as capture_date,
            ${CAPTURE_FALLBACK} as is_capture_date_fallback${selectExtra}
        FROM images i
        LEFT JOIN image_exif ex ON i.id = ex.image_id
        LEFT JOIN image_xmp xm ON i.id = xm.image_id
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0${imsOverlayJoin('ims_legacy', 'i.id')}${joinSql}
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}${pgNullsLastIfDesc(sortOrder)}${QUALITY_TIEBREAK_ORDER_SQL_EX_I}
        ${paginationSql()}
    `;
    try {
        const rows = await queryWithOptionalPickStatus(
            buildSql,
            [...params, ...sortParts.joinParams, ...pagingParams(offset, limit)],
        );
        attachModelSortOverlays(rows, sortParts.modelNameForOverlay);
        return mapRowsThumbnails(rows);
    } catch (e) {
        if (isMissingSubStackSchemaError(e)) {
            warnMissingSubStackSchema(e);
            return [];
        }
        throw e;
    }
}

export async function getStackCount(options: StackQueryOptions = {}): Promise<number> {
    const { folderId, folderIds, minRating, colorLabel, keyword, keywordExact, capturedDate, minClipQualityV0 } = options;
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

    pushKeywordFilter(whereParts, params, keyword, 'i.id', keywordExact);

    if (capturedDate) {
        whereParts.push(`EXISTS (
            SELECT 1 FROM images ci
            LEFT JOIN image_exif cex ON ci.id = cex.image_id
            LEFT JOIN image_xmp cxm ON ci.id = cxm.image_id
            WHERE (COALESCE(i.stack_id, -i.id) = COALESCE(ci.stack_id, -ci.id))
            AND ${castDate(CAPTURE_TS_CEX)} = ?
        )`);
        params.push(capturedDate);
    }

    pushClipQualityFilter(whereParts, params, minClipQualityV0, 'i.id');

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
 * Get scored images for backup planning at or above minScore (score_general 0–1).
 */
export async function getAllScoredImagesForBackup(minScore = 0): Promise<ScoredImageForBackup[]> {
    const sql = `
        SELECT
            i.id,
            COALESCE(fp.path, i.file_path) as path,
            i.file_name,
            i.score_general as composite_score,
            i.image_hash,
            i.stack_id,
            ${castDate(CAPTURE_TS_EI)}::text as capture_date
        FROM images i
        LEFT JOIN file_paths fp ON i.id = fp.image_id AND fp.path_type = 'WIN'
            AND POSITION('/thumbnails/' IN fp.path) = 0
        LEFT JOIN image_exif e ON e.image_id = i.id
        LEFT JOIN image_xmp xm ON xm.image_id = i.id
        WHERE i.score_general >= ?
        ORDER BY i.score_general DESC NULLS LAST
    `;
    const rows = await query(sql, [minScore]) as ScoredImageForBackup[];
    return rows;
}

/** Cheap candidate count (no joins/dedup) for the backup pre-flight fast path. */
export async function countScoredImagesForBackup(minScore = 0): Promise<number> {
    const rows = await query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM images WHERE score_general >= ?`,
        [minScore],
    );
    return Number(rows[0]?.c ?? 0);
}

export type BackupLayoutDetail = {
    id: number;
    exif_model: string | null;
    exif_lens_model: string | null;
};

/** Batch EXIF fields needed for backup destination layout. */
export async function getImageDetailsBatch(ids: number[]): Promise<Map<number, BackupLayoutDetail>> {
    const out = new Map<number, BackupLayoutDetail>();
    if (ids.length === 0) return out;

    const placeholders = ids.map(() => '?').join(', ');
    const sql = `
        SELECT
            i.id,
            COALESCE(ex.model, ex.make) as exif_model,
            ex.lens_model as exif_lens_model
        FROM images i
        LEFT JOIN image_exif ex ON i.id = ex.image_id
        WHERE i.id IN (${placeholders})
    `;
    const rows = await query<BackupLayoutDetail>(sql, ids);
    for (const row of rows) {
        out.set(row.id, row);
    }
    return out;
}

/** Parse pgvector text form "[0.1,0.2,...]" into Float32Array. */
function parsePgVectorEmbedding(raw: unknown): Float32Array | undefined {
    if (raw == null) return undefined;
    if (raw instanceof Buffer || raw instanceof Uint8Array) {
        return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    }
    const text = String(raw).trim();
    if (!text.startsWith('[')) return undefined;
    const inner = text.slice(1, -1);
    if (!inner) return undefined;
    const parts = inner.split(',').map((s) => parseFloat(s.trim()));
    if (parts.some((n) => !Number.isFinite(n))) return undefined;
    return new Float32Array(parts);
}

/** Default-space embeddings for backup MMR (mobilenet_v2_imagenet_gap). */
export async function getEmbeddingsBatch(ids: number[]): Promise<Map<number, Float32Array>> {
    const out = new Map<number, Float32Array>();
    if (ids.length === 0) return out;

    const placeholders = ids.map(() => '?').join(', ');
    const sql = `
        SELECT ie.image_id, ie.embedding::text AS embedding
        FROM image_embeddings ie
        JOIN embedding_spaces es ON es.id = ie.embedding_space_id
        WHERE ie.image_id IN (${placeholders})
          AND es.code = 'mobilenet_v2_imagenet_gap'
    `;
    try {
        const rows = await query<{ image_id: number; embedding: string }>(sql, ids);
        for (const row of rows) {
            const vec = parsePgVectorEmbedding(row.embedding);
            if (vec) out.set(row.image_id, vec);
        }
    } catch (e) {
        console.error('[DB] getEmbeddingsBatch failed:', e);
    }
    return out;
}

export type SimilarPairsQueryResult = {
    pairs: Array<{ id_a: number; id_b: number; similarity: number }>;
    error?: string;
};

/**
 * Find pairs of similar images within a specific set of IDs using pgvector.
 * Returns pairs with similarity >= threshold; error set when the query fails.
 */
export async function getSimilarPairsInGroup(
    imageIds: number[],
    threshold: number,
): Promise<SimilarPairsQueryResult> {
    if (imageIds.length < 2) return { pairs: [] };

    const placeholders = imageIds.map(() => '?').join(', ');
    const sql = `
        SELECT 
            e1.image_id as id_a, 
            e2.image_id as id_b, 
            (1 - (e1.embedding <=> e2.embedding)) as similarity
        FROM image_embeddings e1
        JOIN image_embeddings e2 ON e1.image_id < e2.image_id
        JOIN embedding_spaces es ON es.id = e1.embedding_space_id AND es.id = e2.embedding_space_id
        WHERE es.code = 'mobilenet_v2_imagenet_gap'
          AND e1.image_id IN (${placeholders}) 
          AND e2.image_id IN (${placeholders})
          AND (1 - (e1.embedding <=> e2.embedding)) >= ?
    `;

    const params = [...imageIds, ...imageIds, threshold];

    try {
        const pairs = await query<{ id_a: number; id_b: number; similarity: number }>(sql, params);
        return { pairs };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[DB] getSimilarPairsInGroup failed:', e);
        return { pairs: [], error: message };
    }
}

/**
 * Get unique dates that have images, scoped like the main gallery filters (folder, rating, label, keyword).
 * Used for calendar dot markers so dots match the active filter set.
 */
export async function getDatesWithShots(options: {
    folderId?: number;
    folderIds?: number[];
    minRating?: number;
    colorLabel?: string;
    keyword?: string;
    keywordExact?: boolean;
} = {}): Promise<string[]> {
    const { folderId, folderIds, minRating, colorLabel, keyword, keywordExact } = options;
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

    pushKeywordFilter(whereParts, params, keyword, 'i.id', keywordExact);

    const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

    const sql = `
        SELECT DISTINCT ${castDate(CAPTURE_TS)}::text as capture_date
        FROM images i
        LEFT JOIN image_exif ex ON i.id = ex.image_id
        LEFT JOIN image_xmp xm ON i.id = xm.image_id
        ${whereClause}
        ORDER BY capture_date DESC
    `;

    try {
        const rows = await query<{ capture_date: string }>(sql, params);
        return rows.map(r => r.capture_date);
    } catch (e) {
        console.error('[DB] getDatesWithShots failed:', e);
        return [];
    }
}

/**
 * Shared type definitions for the Electron IPC bridge.
 * Used by db.ts, main.ts, preload.ts, and mirrored in src/electron.d.ts.
 */

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

export interface ImageRow {
    id: number;
    file_path: string;
    file_name: string;
    score_general: number;
    score_technical: number;
    score_aesthetic: number;
    score_spaq: number;
    score_ava: number;
    score_liqe: number;
    rating: number;
    label: string | null;
    created_at?: string;
    thumbnail_path?: string;
}

export interface ImageDetail extends ImageRow {
    job_id?: string;
    file_type?: string;
    score?: number;
    score_koniq?: number;
    score_paq2piq?: number;
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
    win_path?: string;
    file_exists?: boolean;
}

export interface ImageUpdates {
    title?: string;
    description?: string;
    rating?: number;
    label?: string;
    keywords?: string;
}

export interface FolderRow {
    id: number;
    path: string;
    parent_id: number | null;
    is_fully_scored: number;
    image_count: number;
}

export interface StackRow extends ImageRow {
    stack_id?: number | null;
    stack_key?: number;
    image_count?: number;
    sort_value?: number;
}

export interface NefPreviewResult {
    success: boolean;
    buffer?: Uint8Array;
    fallback?: boolean;
    error?: string;
}

export interface DuplicatePair {
    image_id_a: number;
    image_id_b: number;
    similarity: number;
    file_path_a: string;
    file_path_b: string;
}

export interface DuplicateResponse {
    success: boolean;
    data?: {
        duplicates: DuplicatePair[];
    };
    message?: string;
}

export type DatabaseEngine = 'postgres' | 'api';

export interface PostgresSslConfig {
    enabled?: boolean;
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
}

export interface PostgresPoolConfig {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
}

export interface PostgresConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    ssl?: boolean | PostgresSslConfig;
    pool?: PostgresPoolConfig;
}



export interface PostgresDatabaseConfig {
    engine: 'postgres';
    /** @deprecated Prefer `engine`. Kept for backward compatibility with older configs/branches. */
    provider?: 'postgres';
    postgres: PostgresConfig;
}

export interface ApiDatabaseConfig {
    engine: 'api';
    /** @deprecated Prefer `engine`. Kept for backward compatibility with older configs/branches. */
    provider?: 'api';
    api: {
        url?: string;
        timeout?: number;
        dialect?: 'postgres';
        /** SQL shape the gallery builds; align with backend database.engine (default postgres). */
        sqlDialect?: 'postgres';
    };
}

export type DatabaseConfig = PostgresDatabaseConfig | ApiDatabaseConfig;

export interface AppConfig {
    database?: DatabaseConfig;
    dev?: {
        url?: string;
    };
    api?: {
        url?: string;
        port?: number;
        host?: string;
    };

    selection?: Record<string, unknown>;
    /** Optional path remaps for renamed backend folders (thumbnail JPEG locations) */
    paths?: {
        thumbnail_path_remap?: Array<{ from: string; to: string }>;
        /** Default true: map .../image-scoring/thumbnails/ → .../image-scoring-backend/thumbnails/ */
        remap_legacy_image_scoring_thumbnails?: boolean;
        /** Absolute thumbnails root (your local path from config) */
        thumbnail_base_dir?: string;
    };
    /** Root folder for filesystem-only (light) mode when the database is unavailable. */
    lightModeRootFolder?: string;
    [key: string]: unknown;
}

/** One directory entry from `fs:read-dir` (filesystem light mode). */
export interface FsDirEntry {
    name: string;
    path: string;
}

/** Result of paginated `fs:read-dir`. */
export interface FsReadDirResult {
    dirPath: string;
    directories: FsDirEntry[];
    images: FsDirEntry[];
    totalImageCount: number;
    rootPath: string;
}

/** Normalized metadata for folder-mode viewer (EXIF + merged XMP sidecar). */
export interface FileImageMetadataDetail {
    title?: string;
    description?: string;
    keywords?: string;
    rating: number;
    label: string | null;
    exif_iso?: number | null;
    exif_shutter?: string | null;
    exif_aperture?: string | null;
    exif_focal_length?: string | null;
    exif_model?: string | null;
    exif_lens_model?: string | null;
}

export interface FileImageMetadataResult {
    tags: Record<string, unknown>;
    detail: FileImageMetadataDetail;
}
export interface ExportImageContext {
    imageBytes: number[];
    mimeType: string;
    fileName: string;
    id: number;
    sourcePath: string;
    imageUuid: string | null;
    /** True when pixels were re-encoded with EXIF orientation applied (matches on-screen preview). */
    exifOrientationBaked?: boolean;
}

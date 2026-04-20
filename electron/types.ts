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

/** Normalized config returned by config loaders/normalizers. */
export type NormalizedAppConfig = Omit<AppConfig, 'database'> & {
    database: DatabaseConfig;
};

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
    lightModeRootFolder?: string;
    /** Sync: copy new photos from external drives into a structured local folder tree. */
    sync?: {
        /** Destination root where synced photos are stored (e.g. "D:\\Photos"). */
        destinationRoot?: string;
    };
    /** @deprecated Backup thresholds are now computed dynamically (see backupSpace.ts). */
    backup?: Record<string, unknown>;
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
    /** True when pixels were physically re-oriented to match preview. */
    pixelNormalizationApplied?: boolean;
    /** Optional: original orientation read from the preview (for diagnostic logging). */
    previewOrientation?: number | string;
}

// -- Backup Feature Types --

export interface BackupTargetInfo {
    exists: boolean;
    imageCount: number;
    lastBackup: string | null;
    bytes: number;
}

export interface BackupManifestEntry {
    id: number;
    relPath: string;
    score: number;
    size: number;
    hash: string;
}

export interface BackupManifest {
    updatedAt: string;
    images: BackupManifestEntry[];
}

export interface ScoredImageForBackup {
    id: number;
    path: string;
    file_name: string;
    composite_score: number;
    image_hash: string | null;
    stack_id: number | null;
    capture_date: string | null;
}

export interface BackupProgress {
    phase: 'scanning' | 'deduplicating' | 'calculating' | 'copying' | 'cleaning' | 'done';
    current: number;
    total: number;
    detail?: string;
}

export interface BackupResult {
    copied: number;
    skipped: number;
    deduplicated: number;
    errors: string[];
    /** Files deleted from the backup because they are no longer in the current selection. */
    staleRemoved: number;
    /** Candidates removed so the highest-scored copies fit in free space (see rotation in `backupSpace.ts`). */
    droppedForSpace: number;
}

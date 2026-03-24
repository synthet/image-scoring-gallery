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

export type DatabaseEngine = 'firebird' | 'postgres';

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
    password: string;
    ssl?: boolean | PostgresSslConfig;
    pool?: PostgresPoolConfig;
}

export interface FirebirdDatabaseConfig {
    engine?: 'firebird';
    host?: string;
    port?: number;
    path?: string;
    user?: string;
    password?: string;
}

export interface PostgresDatabaseConfig {
    engine: 'postgres';
    postgres: PostgresConfig;
}

export type DatabaseConfig = FirebirdDatabaseConfig | PostgresDatabaseConfig;

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
    firebird?: {
        path?: string;
    };
    selection?: Record<string, unknown>;
    /** Optional path remaps for renamed backend folders (thumbnail JPEG locations) */
    paths?: {
        thumbnail_path_remap?: Array<{ from: string; to: string }>;
        /** Default true: map .../image-scoring/thumbnails/ → .../image-scoring-backend/thumbnails/ */
        remap_legacy_image_scoring_thumbnails?: boolean;
        /** Absolute thumbnails root, e.g. D:\\Projects\\image-scoring-backend\\thumbnails */
        thumbnail_base_dir?: string;
    };
    [key: string]: unknown;
}
export interface ExportImageContext {
    imageBytes: number[];
    mimeType: string;
    fileName: string;
    id: number;
    sourcePath: string;
    imageUuid: string | null;
}

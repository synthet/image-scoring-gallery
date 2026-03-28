export { };
 
export interface BackendJobInfo {
    job_id: string | number;
    job_type: string;
    status: string;
    input_path?: string;
    created_at?: string;
    completed_at?: string;
    log?: string;
    progress?: { current: number; total: number };
    [key: string]: unknown;
}


interface ImageQueryOptions {
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

interface ImageRow {
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

interface ImageDetail extends ImageRow {
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
    image_uuid?: string;
}

interface ImageUpdates {
    title?: string;
    description?: string;
    rating?: number;
    label?: string;
    keywords?: string;
}

interface FolderRow {
    id: number;
    path: string;
    parent_id: number | null;
    is_fully_scored: number;
    image_count: number;
}

interface DuplicatePair {
    image_id_a: number;
    image_id_b: number;
    similarity: number;
    file_path_a: string;
    file_path_b: string;
}

interface DuplicateResponse {
    success: boolean;
    data?: {
        duplicates: DuplicatePair[];
    };
    message?: string;
}

type DatabaseEngine = 'firebird' | 'postgres' | 'api';
// NOTE: Keep the database config types below in sync with electron/types.ts.

interface PostgresSslConfig {
    enabled?: boolean;
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
}

interface PostgresPoolConfig {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
}

interface PostgresConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    ssl?: boolean | PostgresSslConfig;
    pool?: PostgresPoolConfig;
}

interface FirebirdDatabaseConfig {
    engine?: Extract<DatabaseEngine, 'firebird'>;
    /** @deprecated Prefer `engine`. Kept for backward compatibility with older configs/branches. */
    provider?: 'firebird';
    host?: string;
    port?: number;
    path?: string;
    user?: string;
    password?: string;
}

interface PostgresDatabaseConfig {
    engine: Extract<DatabaseEngine, 'postgres'>;
    /** @deprecated Prefer `engine`. Kept for backward compatibility with older configs/branches. */
    provider?: 'postgres';
    postgres: PostgresConfig;
}

interface ApiDatabaseConfig {
    engine: Extract<DatabaseEngine, 'api'>;
    /** @deprecated Prefer `engine`. Kept for backward compatibility with older configs/branches. */
    provider?: 'api';
    api: {
        url?: string;
        timeout?: number;
        dialect?: 'firebird' | 'postgres';
        sqlDialect?: 'firebird' | 'postgres';
    };
}

type DatabaseConfig = FirebirdDatabaseConfig | PostgresDatabaseConfig | ApiDatabaseConfig;

interface AppConfig {
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
    paths?: {
        thumbnail_path_remap?: Array<{ from: string; to: string }>;
        remap_legacy_image_scoring_thumbnails?: boolean;
        thumbnail_base_dir?: string;
    };
    [key: string]: unknown;
}

declare global {
    interface Window {
        electron: {
            ping: () => Promise<string>;
            checkDbConnection: () => Promise<boolean>;
            getImageCount: (options?: ImageQueryOptions) => Promise<number>;
            getImages: (options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getImageDetails: (id: number) => Promise<ImageDetail | null>;
            updateImageDetails: (id: number, updates: ImageUpdates) => Promise<boolean>;
            deleteImage: (id: number) => Promise<boolean>;
            deleteFolder: (id: number) => Promise<boolean>;
            getFolders: () => Promise<FolderRow[]>;
            getKeywords: () => Promise<string[]>;
            findNearDuplicates: (options?: { threshold?: number; folder_path?: string; limit?: number }) => Promise<DuplicateResponse>;
            searchSimilarImages: (options: { imageId: number; limit?: number; folderId?: number; folderPath?: string; minSimilarity?: number }) => Promise<{ query_image_id: number; results: Array<Record<string, unknown>>; count: number; error?: string }>;
            findOutliers: (options: { folderPath: string; zThreshold?: number; k?: number; limit?: number }) => Promise<{
                outliers: Array<{ image_id: number; file_path: string; outlier_score: number; z_score: number; nearest_neighbors: Array<{ image_id: number; file_path: string; similarity: number }> }>;
                stats: Record<string, unknown>;
                skipped: Array<Record<string, unknown>>;
            }>;
            getStacks: (options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getImagesByStack: (stackId: number | null, options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getStackCount: (options?: ImageQueryOptions) => Promise<number>;
            rebuildStackCache: () => Promise<{ success: boolean; count: number }>;
            log: (level: string, message: string, data?: unknown) => Promise<boolean>;
            extractNefPreview: (filePath: string) => Promise<{
                success: boolean;
                buffer?: Uint8Array;
                fallback?: boolean;
                error?: string;
            }>;
            getApiPort: () => Promise<number>;
            getApiConfig: () => Promise<{ url: string }>;
            getConfig: () => Promise<AppConfig>;
            saveConfig: (updates: Partial<AppConfig>) => Promise<AppConfig>;
            setCurrentExportImageContext: (context: { imageBytes: number[]; mimeType: string; fileName: string; id: number; sourcePath: string; imageUuid: string | null } | null) => Promise<boolean>;
            readExif: (filePath: string) => Promise<Record<string, unknown>>;
            getDiagnostics: () => Promise<{
                os: { platform: string; release: string; arch: string; uptime: number };
                versions: { electron: string; node: string; chrome: string; v8: string };
                database: { engine: string; connected: boolean; host: string; database: string };
                api: { url: string; connected: boolean };
                memory: { workingSetSize: number; peakWorkingSetSize: number; privateBytes?: number; sharedBytes?: number } | null;
            }>;
            getProcessMemoryInfo: () => Promise<{ workingSetSize: number; peakWorkingSetSize: number; privateBytes?: number; sharedBytes?: number } | null>;
            onOpenSettings: (callback: () => void) => () => void;
            onOpenDuplicates: (callback: () => void) => () => void;
            onOpenRuns: (callback: () => void) => () => void;
            onOpenDiagnostics: (callback: () => void) => () => void;
            onImportFolderSelected: (callback: (folderPath: string) => void) => () => void;
            importRun: (folderPath: string) => Promise<{ added: number; skipped: number; errors: string[] }>;
            onImportProgress: (callback: (data: { current: number; total: number; path?: string }) => void) => () => void;
            onShowNotification: (callback: (data: { message: string; type: 'info' | 'success' | 'warning' | 'error' }) => void) => () => void;

            // ── Backend API (Python REST) ───────────────────────────────
            api: {
                healthCheck: () => Promise<BackendHealthResponse>;
                isAvailable: () => Promise<boolean>;
                getStatus: () => Promise<BackendStatusResponse>;
                getStats: () => Promise<BackendDatabaseStats>;

                // Scoring
                startScoring: (opts: BackendScoringStartRequest) => Promise<BackendApiResponse>;
                stopScoring: () => Promise<BackendApiResponse>;
                getScoringStatus: () => Promise<BackendStatusResponse>;
                scoreSingleImage: (filePath: string) => Promise<BackendApiResponse>;

                // Tagging
                startTagging: (opts: BackendTaggingStartRequest) => Promise<BackendApiResponse>;
                stopTagging: () => Promise<BackendApiResponse>;
                getTaggingStatus: () => Promise<BackendStatusResponse>;
                tagSingleImage: (opts: BackendTaggingSingleRequest) => Promise<BackendApiResponse>;
                propagateTags: (opts: BackendTagPropagationRequest) => Promise<BackendApiResponse>;

                // Clustering
                startClustering: (opts: BackendClusteringStartRequest) => Promise<BackendApiResponse>;
                stopClustering: () => Promise<BackendApiResponse>;
                getClusteringStatus: () => Promise<BackendStatusResponse>;

                // Pipeline
                submitPipeline: (opts: BackendPipelineSubmitRequest) => Promise<BackendApiResponse>;
                skipPipelinePhase: (opts: BackendPipelinePhaseControlRequest) => Promise<BackendApiResponse>;
                retryPipelinePhase: (opts: BackendPipelinePhaseControlRequest) => Promise<BackendApiResponse>;

                // Jobs
                getRecentJobs: () => Promise<BackendJobInfo[]>;
                getJobDetail: (jobId: string | number) => Promise<BackendJobInfo>;
                getAllStatus: () => Promise<BackendAllRunnersStatus>;
                getJobsQueue: (limit?: number) => Promise<BackendQueueResponse>;
                cancelJob: (jobId: string | number) => Promise<BackendApiResponse>;

                // Scope tree
                getScopeTree: () => Promise<{
                    folders: Array<{
                        folder_id: number;
                        folder_path: string;
                        indexing_status: string;
                        scoring_status: string;
                        tagging_status: string;
                    }>;
                }>;
            };
        };
    }

    interface BackendApiResponse {
        success: boolean;
        message: string;
        data?: Record<string, unknown>;
    }

    interface BackendHealthResponse {
        status: string;
        scoring_available: boolean;
        tagging_available: boolean;
        clustering_available: boolean;
    }

    interface BackendStatusResponse {
        is_running: boolean;
        status_message: string;
        progress: { current: number; total: number };
        log: string;
        job_type?: string | null;
    }

    interface BackendScoringStartRequest {
        input_path: string;
        skip_existing?: boolean;
        force_rescore?: boolean;
    }

    interface BackendTaggingStartRequest {
        input_path: string;
        custom_keywords?: string[] | null;
        overwrite?: boolean;
        generate_captions?: boolean;
    }

    interface BackendTaggingSingleRequest {
        file_path: string;
        custom_keywords?: string[] | null;
        generate_captions?: boolean;
    }

    interface BackendTagPropagationRequest {
        folder_path?: string | null;
        dry_run?: boolean;
        k?: number | null;
        min_similarity?: number | null;
        min_keyword_confidence?: number | null;
        min_support_neighbors?: number | null;
        write_mode?: 'replace_missing_only' | 'append' | null;
        max_keywords?: number | null;
    }

    interface BackendClusteringStartRequest {
        input_path?: string | null;
        threshold?: number | null;
        time_gap?: number | null;
        force_rescan?: boolean;
    }

    interface BackendPipelinePhaseControlRequest {
        input_path: string;
        phase_code: string;
        reason?: string | null;
        actor?: string | null;
    }

    interface BackendAllRunnersStatus {
        scoring: BackendStatusResponse & { available?: boolean };
        tagging: BackendStatusResponse & { available?: boolean };
        [key: string]: unknown;
    }

    interface BackendQueueResponse {
        queue_depth: number;
        jobs: BackendJobInfo[];
        [key: string]: unknown;
    }

    interface BackendPipelineSubmitRequest {
        input_path: string;
        operations?: string[];
        skip_existing?: boolean;
        custom_keywords?: string[] | null;
        generate_captions?: boolean;
        clustering_threshold?: number | null;
    }

    interface BackendDatabaseStats {
        total_images: number;
        by_rating: Record<string, number>;
        by_label: Record<string, number>;
        score_distribution: Record<string, number>;
        average_scores: Record<string, number>;
        total_folders: number;
        total_stacks: number;
        jobs_by_status: Record<string, number>;
        images_today: number;
        error?: string;
        [key: string]: unknown;
    }
}

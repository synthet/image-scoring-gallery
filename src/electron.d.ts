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

export interface DiagnosticsReport {
    os: { platform: string; release: string; arch: string; uptime: number };
    versions: { electron: string; node: string; chrome: string; v8: string };
    database: { engine: string; connected: boolean; host: string; database: string };
    api: { url: string; connected: boolean };
    memory: { workingSetSize: number; peakWorkingSetSize: number; privateBytes?: number; sharedBytes?: number } | null;
}

export interface ProcessMemorySnapshot {
    workingSetSize: number;
    peakWorkingSetSize: number;
    privateBytes?: number;
    sharedBytes?: number;
}

import type {
    AppConfig,
    BackupProgress,
    BackupResult,
    BackupTargetInfo,
    DuplicateResponse,
    ExportImageContext,
    FileImageMetadataResult,
    FolderRow,
    FsReadDirResult,
    ImageDetail,
    ImageQueryOptions,
    ImageRow,
    ImageUpdates,
} from '../electron/types';

export type {
    AppConfig,
    BackupProgress,
    BackupResult,
    BackupTargetInfo,
    DuplicateResponse,
    ExportImageContext,
    FileImageMetadataResult,
    FolderRow,
    FsReadDirResult,
    ImageDetail,
    ImageQueryOptions,
    ImageRow,
    ImageUpdates,
} from '../electron/types';

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
            getDatesWithShots: (options?: {
                folderId?: number;
                folderIds?: number[];
                minRating?: number;
                colorLabel?: string;
                keyword?: string;
            }) => Promise<string[]>;
            getFolders: () => Promise<FolderRow[]>;
            getKeywords: () => Promise<string[]>;
            findNearDuplicates: (options?: { threshold?: number; folder_path?: string; limit?: number }) => Promise<DuplicateResponse>;
            searchSimilarImages: (options: { imageId: number; limit?: number; folderId?: number; folderPath?: string; minSimilarity?: number }) => Promise<{ query_image_id: number; results: Array<Record<string, unknown>>; count: number; error?: string }>;
            getStacks: (options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getImagesByStack: (stackId: number | null, options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getStackCount: (options?: ImageQueryOptions) => Promise<number>;
            rebuildStackCache: (context?: { smartCover?: boolean }) => Promise<{ success: boolean; count: number }>;
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
            setCurrentExportImageContext: (context: ExportImageContext | null) => Promise<boolean>;
            readExif: (filePath: string) => Promise<Record<string, unknown>>;
            readImageMetadata: (filePath: string) => Promise<FileImageMetadataResult>;
            getLightModeRoot: () => Promise<string>;
            readFsDir: (args: {
                dirPath: string;
                offset?: number;
                limit?: number;
                kinds?: 'all' | 'dirsOnly';
            }) => Promise<FsReadDirResult>;
            setGalleryMode: (mode: 'db' | 'folder') => Promise<'db' | 'folder'>;
            getGalleryMode: () => Promise<'db' | 'folder'>;
            onAppModeChanged: (callback: (mode: 'db' | 'folder') => void) => () => void;
            selectDirectory: () => Promise<string | null>;
            getDiagnostics: () => Promise<DiagnosticsReport>;
            getProcessMemoryInfo: () => Promise<ProcessMemorySnapshot | null>;
            onOpenSettings: (callback: () => void) => () => void;
            onOpenDuplicates: (callback: () => void) => () => void;
            onOpenRuns: (callback: () => void) => () => void;
            onOpenEmbeddings: (callback: () => void) => () => void;
            onOpenDiagnostics: (callback: () => void) => () => void;
            onImportFolderSelected: (callback: (folderPath: string) => void) => () => void;
            importRun: (folderPath: string) => Promise<{ added: number; skipped: number; errors: string[] }>;
            onImportProgress: (callback: (data: { current: number; total: number; path?: string }) => void) => () => void;
            onShowNotification: (callback: (data: { message: string; type: 'info' | 'success' | 'warning' | 'error' }) => void) => () => void;

            // ── Sync ────────────────────────────────────────────────────
            onSyncSourceSelected: (callback: (sourcePath: string) => void) => () => void;
            syncPreview: (sourcePath: string) => Promise<{
                thresholdDate: string | null;
                destinationRoot: string;
                scanned: number;
                skipped: number;
                wouldCopy: number;
                importOnly: number;
                newFolders: string[];
                errors: string[];
            }>;
            syncRun: (sourcePath: string) => Promise<{
                scanned: number;
                copied: number;
                imported: number;
                skipped: number;
                folders: number;
                errors: string[];
                thresholdDate: string | null;
            }>;
            onSyncProgress: (callback: (data: { phase: string; current: number; total: number; detail: string }) => void) => () => void;

            // ── Backup ──────────────────────────────────────────────────
            backupCheckTarget: (targetPath: string) => Promise<BackupTargetInfo | null>;
            backupRun: (targetPath: string) => Promise<BackupResult>;
            onBackupTargetSelected: (callback: (targetPath: string) => void) => () => void;
            onBackupProgress: (callback: (data: BackupProgress) => void) => () => void;

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
                fixImageMetadata: (filePath: string) => Promise<BackendApiResponse>;

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
        focus_image_id?: number | null;
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

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
    BackupPreviewInfo,
    BackupTargetInfo,
    DuplicateResponse,
    ExportImageContext,
    FileImageMetadataResult,
    FolderRow,
    FsReadDirResult,
    ImageDetail,
    ImagePhaseStatus,
    ImageQueryOptions,
    ImageRow,
    ImageUpdates,
    KeywordCloudEntry,
    SubStackRow,

    SyncCandidate,
    SyncPreviewResult,
    SyncRunResult,
} from '../electron/types';
import type {
    ExampleQueriesResponse,
    OutlierSearchResult,
    TextSearchResponse,
} from '../electron/apiTypes';

export type {
    AppConfig,
    BackupPreviewInfo,
    BackupProgress,
    BackupResult,
    BackupTargetInfo,
    DuplicateResponse,
    ExportImageContext,
    FileImageMetadataResult,
    FolderRow,
    FsReadDirResult,
    ImageDetail,
    ImagePhaseStatus,
    ImageQueryOptions,
    ImageRow,
    ImageUpdates,
    KeywordCloudEntry,
    SubStackRow,
    SyncCandidate,
    SyncPreviewResult,
    SyncRunResult,
} from '../electron/types';

declare global {
    interface Window {
        electron: {
            ping: () => Promise<string>;
            checkDbConnection: () => Promise<boolean>;
            getImageCount: (options?: ImageQueryOptions) => Promise<number>;
            getImages: (options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getImageDetails: (id: number) => Promise<ImageDetail | null>;
            getImagePhaseStatuses: (id: number) => Promise<ImagePhaseStatus[]>;
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
            getKeywordCloud: (options: {
                kind: 'general' | 'species';
                limit?: number;
                folderId?: number;
            }) => Promise<KeywordCloudEntry[]>;
            findNearDuplicates: (options?: { threshold?: number; folder_path?: string; limit?: number }) => Promise<DuplicateResponse>;
            searchSimilarImages: (options: { imageId: number; limit?: number; folderId?: number; folderPath?: string; minSimilarity?: number }) => Promise<{ query_image_id: number; results: Array<Record<string, unknown>>; count: number; error?: string }>;
            searchByText: (options: import('../electron/apiTypes').TextSearchParams) => Promise<TextSearchResponse>;
            cancelTextSearch: () => Promise<void>;
            getSearchExampleQueries: (options?: { limit?: number; folder_path?: string }) => Promise<ExampleQueriesResponse>;
            findOutliers: (options: { folderPath: string; zThreshold?: number; k?: number; limit?: number }) => Promise<OutlierSearchResult>;
            getStacks: (options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getImagesByStack: (stackId: number | null, options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getImagesByStackUngrouped: (stackId: number, options?: ImageQueryOptions) => Promise<ImageRow[]>;
            getSubstacksForStack: (stackId: number, options?: ImageQueryOptions) => Promise<SubStackRow[]>;
            getImagesBySubStack: (subStackId: number, options?: ImageQueryOptions) => Promise<ImageRow[]>;
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
            getApiConfig: () => Promise<{ url: string; browserUrl?: string }>;
            getConfig: () => Promise<AppConfig>;
            saveConfig: (updates: Partial<AppConfig>) => Promise<AppConfig>;
            setCurrentExportImageContext: (context: ExportImageContext | null) => Promise<boolean>;
            setSelectionPath: (filePath: string | null) => Promise<boolean>;
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
            openExternalUrl: (url: string) => Promise<void>;
            getDiagnostics: () => Promise<DiagnosticsReport>;
            getProcessMemoryInfo: () => Promise<ProcessMemorySnapshot | null>;
            onOpenSettings: (callback: () => void) => () => void;
            onOpenDiagnostics: (callback: () => void) => () => void;
            onOpenSearch: (callback: () => void) => () => void;
            onOpenKeywords: (callback: () => void) => () => void;
            onImportFolderSelected: (callback: (folderPath: string) => void) => () => void;
            importRun: (folderPath: string) => Promise<{
                added: number;
                skipped: number;
                errors: string[];
                processing?: {
                    method: 'api' | 'queue' | 'none';
                    jobId?: string | number;
                    queuedCount?: number;
                    reason?: 'api-unavailable' | 'api-error';
                    error?: string;
                };
            }>;
            onImportProgress: (callback: (data: { current: number; total: number; path?: string }) => void) => () => void;
            onShowNotification: (callback: (data: { message: string; type: 'info' | 'success' | 'warning' | 'error' }) => void) => () => void;

            // ── Sync ────────────────────────────────────────────────────
            onSyncSourceSelected: (callback: (sourcePath: string) => void) => () => void;
            syncPreview: (sourcePath: string) => Promise<SyncPreviewResult>;
            syncRun: (sourcePath: string, pickedCandidates?: SyncCandidate[]) => Promise<SyncRunResult>;
            onSyncProgress: (callback: (data: { phase: string; current: number; total: number; detail: string }) => void) => () => void;

            // ── Backup ──────────────────────────────────────────────────
            backupCheckTarget: (targetPath: string) => Promise<BackupTargetInfo | null>;
            backupPreview: (targetPath: string) => Promise<BackupPreviewInfo | null>;
            backupRun: (
                targetPath: string,
                options?: { confirmMassDelete?: boolean },
            ) => Promise<BackupResult>;
            onBackupTargetSelected: (callback: (targetPath: string) => void) => () => void;
            onBackupProgress: (callback: (data: BackupProgress) => void) => () => void;

            // ── Backend API (Python REST) ───────────────────────────────
            api: {
                healthCheck: () => Promise<BackendHealthResponse>;
                isAvailable: () => Promise<boolean>;
                getStatus: () => Promise<BackendStatusResponse>;
                getStats: () => Promise<BackendDatabaseStats>;
                getScoringSortOptions: () => Promise<Array<{ value: string; label: string; group: string }>>;
                getStackAnalytics: (stackId: number) => Promise<Record<string, unknown>>;
                getAgentCullGroups: (params?: {
                    stackId?: number;
                    subStackId?: number;
                    status?: string;
                    limit?: number;
                    offset?: number;
                }) => Promise<{ groups: Record<string, unknown>[] }>;
                getAgentCullGroup: (groupId: number) => Promise<Record<string, unknown>>;
                runAgentCullReview: (body: {
                    stackId: number;
                    subStackId?: number | null;
                    dryRun?: boolean;
                    force?: boolean;
                    agent?: string;
                }) => Promise<Record<string, unknown>>;
                applyAgentCullCandidates: (groupId: number, body?: {
                    recommendationIds?: number[];
                    actor?: string;
                    note?: string;
                }) => Promise<Record<string, unknown>>;
                approveAgentCullGroup: (groupId: number, body?: {
                    recommendationIds?: number[];
                    actor?: string;
                    note?: string;
                }) => Promise<Record<string, unknown>>;
                rejectAgentCullGroup: (groupId: number, body?: {
                    recommendationIds?: number[];
                    actor?: string;
                    note?: string;
                }) => Promise<Record<string, unknown>>;
                rollbackAgentCullRecommendation: (recommendationId: number, body?: {
                    actor?: string;
                    note?: string;
                }) => Promise<Record<string, unknown>>;
                updateImagePickStatus: (imageId: number, pickStatus: -1 | 0 | 1) => Promise<Record<string, unknown>>;

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
        workspace_target?: string | null;
        image_ids?: number[] | null;
        image_paths?: string[] | null;
        folder_ids?: number[] | null;
        folder_paths?: string[] | null;
        recursive?: boolean;
        stage_codes?: string[];
        workflow_template?: string;
        skip_existing?: boolean;
        custom_keywords?: string[] | null;
        generate_captions?: boolean;
        clustering_threshold?: number | null;
        clustering_time_gap?: number | null;
        clustering_force_rescan?: boolean;
        exclude_image_paths?: string[] | null;
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

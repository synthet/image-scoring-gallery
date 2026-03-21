import { contextBridge, ipcRenderer } from 'electron';
import type { ImageQueryOptions, ImageRow, ImageDetail, ImageUpdates, FolderRow, DuplicateResponse, AppConfig, ExportImageContext } from './types';
import type {
    ApiResponse as BackendApiResponse,
    HealthResponse,
    StatusResponse,
    AllRunnersStatus,
    ScoringStartRequest,
    TaggingStartRequest,
    TaggingSingleRequest,
    TagPropagationRequest,
    ClusteringStartRequest,
    PipelineSubmitRequest,
    PipelinePhaseControlRequest,
    QueueResponse,
    JobInfo,
    DatabaseStats,
    SimilarSearchResult,
    OutlierSearchResult,
    ScopeTreeResponse,
} from './apiTypes';

/**
 * Unwraps IPC envelope responses.
 * IPC handlers return { ok: boolean, data?: T, error?: string }
 * This function extracts the data or throws the error.
 */
function unwrapEnvelope<T>(response: { ok: boolean; data?: T; error?: string }): T {
    if (response.ok) {
        return response.data as T;
    }
    throw new Error(response.error || 'Unknown error');
}

contextBridge.exposeInMainWorld('electron', {
    ping: () => ipcRenderer.invoke('ping'),
    checkDbConnection: async () => {
        const response = await ipcRenderer.invoke('db:check-connection');
        return unwrapEnvelope<boolean>(response);
    },
    getImageCount: async (options?: ImageQueryOptions) => {
        const response = await ipcRenderer.invoke('db:get-image-count', options);
        return unwrapEnvelope<number>(response);
    },
    getImages: async (options?: ImageQueryOptions) => {
        const response = await ipcRenderer.invoke('db:get-images', options);
        return unwrapEnvelope<ImageRow[]>(response);
    },
    getImageDetails: async (id: number) => {
        const response = await ipcRenderer.invoke('db:get-image-details', id);
        return unwrapEnvelope<ImageDetail | null>(response);
    },
    updateImageDetails: async (id: number, updates: ImageUpdates) => {
        const response = await ipcRenderer.invoke('db:update-image-details', { id, updates });
        return unwrapEnvelope<boolean>(response);
    },
    deleteImage: async (id: number) => {
        const response = await ipcRenderer.invoke('db:delete-image', id);
        return unwrapEnvelope<boolean>(response);
    },
    deleteFolder: async (id: number) => {
        const response = await ipcRenderer.invoke('db:delete-folder', id);
        return unwrapEnvelope<boolean>(response);
    },
    getFolders: async () => {
        const response = await ipcRenderer.invoke('db:get-folders');
        return unwrapEnvelope<FolderRow[]>(response);
    },
    getKeywords: async () => {
        const response = await ipcRenderer.invoke('db:get-keywords');
        return unwrapEnvelope<string[]>(response);
    },
    findNearDuplicates: async (options?: { threshold?: number; folder_path?: string; limit?: number }) => {
        // Find duplicates doesn't use standard DB envelope
        return await ipcRenderer.invoke('mcp-find-duplicates', options) as DuplicateResponse;
    },
    searchSimilarImages: async (options: { imageId: number; limit?: number; folderId?: number; folderPath?: string; minSimilarity?: number }) => {
        const response = await ipcRenderer.invoke('mcp:search-similar', options);
        return unwrapEnvelope<SimilarSearchResult>(response);
    },
    findOutliers: async (options: { folderPath: string; zThreshold?: number; k?: number; limit?: number }) => {
        const response = await ipcRenderer.invoke('api:outliers', options);
        return unwrapEnvelope<OutlierSearchResult>(response);
    },
    getStacks: async (options?: ImageQueryOptions) => {
        const response = await ipcRenderer.invoke('db:get-stacks', options);
        return unwrapEnvelope<ImageRow[]>(response);
    },
    getImagesByStack: async (stackId: number | null, options?: ImageQueryOptions) => {
        const response = await ipcRenderer.invoke('db:get-images-by-stack', { stackId, options });
        return unwrapEnvelope<ImageRow[]>(response);
    },
    getStackCount: async (options?: ImageQueryOptions) => {
        const response = await ipcRenderer.invoke('db:get-stack-count', options);
        return unwrapEnvelope<number>(response);
    },
    rebuildStackCache: async () => {
        const response = await ipcRenderer.invoke('db:rebuild-stack-cache');
        return unwrapEnvelope<{ success: boolean; count: number }>(response);
    },
    log: async (level: string, message: string, data?: unknown) => {
        return ipcRenderer.invoke('debug:log', { level, message, data, timestamp: Date.now() });
    },
    extractNefPreview: async (filePath: string) => {
        const response = await ipcRenderer.invoke('nef:extract-preview', filePath);
        // NEF preview doesn't use envelope pattern
        return response;
    },
    getApiPort: async () => {
        return ipcRenderer.invoke('system:get-api-port');
    },
    getApiConfig: async () => {
        return ipcRenderer.invoke('system:get-api-config');
    },
    getConfig: async () => {
        const response = await ipcRenderer.invoke('system:get-config');
        return unwrapEnvelope<AppConfig>(response);
    },
    saveConfig: async (updates: Partial<AppConfig>) => {
        const response = await ipcRenderer.invoke('system:save-config', updates);
        return unwrapEnvelope<AppConfig>(response);
    },
    setCurrentExportImageContext: async (context: ExportImageContext | null) => {
        return ipcRenderer.invoke('export:set-current-image-context', context);
    },
    readExif: async (filePath: string) => {
        const response = await ipcRenderer.invoke('nef:read-exif', filePath);
        return unwrapEnvelope<Record<string, unknown>>(response);
    },
    onOpenSettings: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('open-settings', handler);
        return () => {
            ipcRenderer.removeListener('open-settings', handler);
        };
    },
    onOpenDuplicates: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('open-duplicates', handler);
        return () => {
            ipcRenderer.removeListener('open-duplicates', handler);
        };
    },
    onOpenRuns: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('open-runs', handler);
        return () => {
            ipcRenderer.removeListener('open-runs', handler);
        };
    },
    onImportFolderSelected: (callback: (folderPath: string) => void) => {
        const handler = (_: unknown, folderPath: string) => callback(folderPath);
        ipcRenderer.on('import:folder-selected', handler);
        return () => {
            ipcRenderer.removeListener('import:folder-selected', handler);
        };
    },
    importRun: async (folderPath: string) => {
        const response = await ipcRenderer.invoke('import:run', folderPath);
        return unwrapEnvelope<{ added: number; skipped: number; errors: string[] }>(response);
    },
    onImportProgress: (callback: (data: { current: number; total: number; path?: string }) => void) => {
        const handler = (_: unknown, data: { current: number; total: number; path?: string }) => callback(data);
        ipcRenderer.on('import:progress', handler);
        return () => {
            ipcRenderer.removeListener('import:progress', handler);
        };
    },
    onShowNotification: (callback: (data: { message: string; type: 'info' | 'success' | 'warning' | 'error' }) => void) => {
        const handler = (_: unknown, data: { message: string; type: 'info' | 'success' | 'warning' | 'error' }) => callback(data);
        ipcRenderer.on('show-notification', handler);
        return () => {
            ipcRenderer.removeListener('show-notification', handler);
        };
    },

    // ── Backend API (Python REST) ───────────────────────────────────────
    api: {
        healthCheck: async () => {
            const r = await ipcRenderer.invoke('api:health');
            return unwrapEnvelope<HealthResponse>(r);
        },
        isAvailable: async () => {
            const r = await ipcRenderer.invoke('api:is-available');
            return unwrapEnvelope<boolean>(r);
        },
        getStatus: async () => {
            const r = await ipcRenderer.invoke('api:status');
            return unwrapEnvelope<StatusResponse>(r);
        },
        getStats: async () => {
            const r = await ipcRenderer.invoke('api:stats');
            return unwrapEnvelope<DatabaseStats>(r);
        },

        // Scoring
        startScoring: async (opts: ScoringStartRequest) => {
            const r = await ipcRenderer.invoke('api:scoring-start', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        stopScoring: async () => {
            const r = await ipcRenderer.invoke('api:scoring-stop');
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        getScoringStatus: async () => {
            const r = await ipcRenderer.invoke('api:scoring-status');
            return unwrapEnvelope<StatusResponse>(r);
        },
        scoreSingleImage: async (filePath: string) => {
            const r = await ipcRenderer.invoke('api:scoring-single', filePath);
            return unwrapEnvelope<BackendApiResponse>(r);
        },

        // Tagging
        startTagging: async (opts: TaggingStartRequest) => {
            const r = await ipcRenderer.invoke('api:tagging-start', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        stopTagging: async () => {
            const r = await ipcRenderer.invoke('api:tagging-stop');
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        getTaggingStatus: async () => {
            const r = await ipcRenderer.invoke('api:tagging-status');
            return unwrapEnvelope<StatusResponse>(r);
        },
        tagSingleImage: async (opts: TaggingSingleRequest) => {
            const r = await ipcRenderer.invoke('api:tagging-single', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        propagateTags: async (opts: TagPropagationRequest) => {
            const r = await ipcRenderer.invoke('api:tagging-propagate', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },

        // Clustering
        startClustering: async (opts: ClusteringStartRequest) => {
            const r = await ipcRenderer.invoke('api:clustering-start', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        stopClustering: async () => {
            const r = await ipcRenderer.invoke('api:clustering-stop');
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        getClusteringStatus: async () => {
            const r = await ipcRenderer.invoke('api:clustering-status');
            return unwrapEnvelope<StatusResponse>(r);
        },

        // Pipeline
        submitPipeline: async (opts: PipelineSubmitRequest) => {
            const r = await ipcRenderer.invoke('api:pipeline-submit', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        skipPipelinePhase: async (opts: PipelinePhaseControlRequest) => {
            const r = await ipcRenderer.invoke('api:pipeline-skip', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },
        retryPipelinePhase: async (opts: PipelinePhaseControlRequest) => {
            const r = await ipcRenderer.invoke('api:pipeline-retry', opts);
            return unwrapEnvelope<BackendApiResponse>(r);
        },

        // Jobs
        getRecentJobs: async () => {
            const r = await ipcRenderer.invoke('api:jobs-recent');
            return unwrapEnvelope<JobInfo[]>(r);
        },
        getJobDetail: async (jobId: string | number) => {
            const r = await ipcRenderer.invoke('api:job-detail', jobId);
            return unwrapEnvelope<JobInfo>(r);
        },
        getAllStatus: async () => {
            const r = await ipcRenderer.invoke('api:status-all');
            return unwrapEnvelope<AllRunnersStatus>(r);
        },
        getJobsQueue: async (limit?: number) => {
            const r = await ipcRenderer.invoke('api:jobs-queue', limit);
            return unwrapEnvelope<QueueResponse>(r);
        },
        cancelJob: async (jobId: string | number) => {
            const r = await ipcRenderer.invoke('api:job-cancel', jobId);
            return unwrapEnvelope<BackendApiResponse>(r);
        },

        // Scope tree
        getScopeTree: async () => {
            const r = await ipcRenderer.invoke('api:get-scope-tree');
            return unwrapEnvelope<ScopeTreeResponse>(r);
        },
    },
});

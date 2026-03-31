/**
 * Runtime bridge between the React UI and the host environment.
 *
 * - Electron mode  → delegates every call to `window.electron` (IPC via preload).
 * - Browser mode   → implements the same interface using HTTP fetch to the
 *                    Express server at /gallery-api/*.
 *
 * All source files that previously called `window.electron.xxx()` should
 * `import { bridge } from '../bridge'` and call `bridge.xxx()` instead.
 */

import type { FileImageMetadataResult } from '../electron/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = '/gallery-api';

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = new URL(BASE + path, window.location.origin);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null) continue;
            if (Array.isArray(v)) {
                v.forEach((item) => url.searchParams.append(k, String(item)));
            } else {
                url.searchParams.set(k, String(v));
            }
        }
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GET ${path} failed (${res.status}): ${text}`);
    }
    const body = await res.json() as { ok?: boolean; data?: T } | T;
    if (body !== null && typeof body === 'object' && 'ok' in body && 'data' in body) {
        const envelope = body as { ok: boolean; data?: T; error?: string };
        if (!envelope.ok) throw new Error(envelope.error ?? 'Request failed');
        return envelope.data as T;
    }
    return body as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST ${path} failed (${res.status}): ${text}`);
    }
    const data = await res.json() as { ok?: boolean; data?: T; error?: string } | T;
    if (data !== null && typeof data === 'object' && 'ok' in data && 'data' in data) {
        const envelope = data as { ok: boolean; data?: T; error?: string };
        if (!envelope.ok) throw new Error(envelope.error ?? 'Request failed');
        return envelope.data as T;
    }
    return data as T;
}

async function del<T>(path: string): Promise<T> {
    const res = await fetch(BASE + path, { method: 'DELETE' });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`DELETE ${path} failed (${res.status}): ${text}`);
    }
    const data = await res.json() as { ok?: boolean; data?: T; error?: string } | T;
    if (data !== null && typeof data === 'object' && 'ok' in data && 'data' in data) {
        const envelope = data as { ok: boolean; data?: T; error?: string };
        if (!envelope.ok) throw new Error(envelope.error ?? 'Request failed');
        return envelope.data as T;
    }
    return data as T;
}

function noop() { return () => { /* no-op cleanup */ }; }

const emptyFileImageMetadata = (): FileImageMetadataResult => ({
    tags: {},
    detail: {
        rating: 0,
        label: null,
    },
});

// ── Folder mode (Electron): synchronous renderer flag + IPC stubs ─────────────

export type GalleryBridgeAppMode = 'db' | 'folder';

let galleryAppMode: GalleryBridgeAppMode = 'db';

/** Called from AppModeContext whenever gallery mode changes (including initial). */
export function setGalleryAppMode(mode: GalleryBridgeAppMode): void {
    galleryAppMode = mode;
}

function bridgeIsElectronHost(): boolean {
    return typeof window !== 'undefined' && !!window.electron;
}

function useFolderModeStubs(): boolean {
    return bridgeIsElectronHost() && galleryAppMode === 'folder';
}

const FOLDER_API_STUB: Window['electron']['api'] = {
    healthCheck: async () => ({
        status: 'unavailable',
        scoring_available: false,
        tagging_available: false,
        clustering_available: false,
    }),
    isAvailable: async () => false,
    getStatus: async () => ({
        is_running: false,
        status_message: 'folder mode',
        progress: { current: 0, total: 0 },
        log: '',
    }),
    getStats: async () => ({
        total_images: 0,
        by_rating: {},
        by_label: {},
        score_distribution: {},
        average_scores: {},
        total_folders: 0,
        total_stacks: 0,
        jobs_by_status: {},
        images_today: 0,
        error: 'folder mode',
    }),
    startScoring: async () => ({ success: false, message: 'folder mode' }),
    stopScoring: async () => ({ success: false, message: 'folder mode' }),
    getScoringStatus: async () => ({
        is_running: false,
        status_message: '',
        progress: { current: 0, total: 0 },
        log: '',
    }),
    scoreSingleImage: async () => ({ success: false, message: 'folder mode' }),
    startTagging: async () => ({ success: false, message: 'folder mode' }),
    stopTagging: async () => ({ success: false, message: 'folder mode' }),
    getTaggingStatus: async () => ({
        is_running: false,
        status_message: '',
        progress: { current: 0, total: 0 },
        log: '',
    }),
    tagSingleImage: async () => ({ success: false, message: 'folder mode' }),
    propagateTags: async () => ({ success: false, message: 'folder mode' }),
    startClustering: async () => ({ success: false, message: 'folder mode' }),
    stopClustering: async () => ({ success: false, message: 'folder mode' }),
    getClusteringStatus: async () => ({
        is_running: false,
        status_message: '',
        progress: { current: 0, total: 0 },
        log: '',
    }),
    submitPipeline: async () => ({ success: false, message: 'folder mode' }),
    skipPipelinePhase: async () => ({ success: false, message: 'folder mode' }),
    retryPipelinePhase: async () => ({ success: false, message: 'folder mode' }),
    getRecentJobs: async () => [],
    getJobDetail: async () => ({ status: 'unavailable' }),
    getAllStatus: async () => ({
        scoring: {
            is_running: false,
            status_message: '',
            progress: { current: 0, total: 0 },
            log: '',
            available: false,
        },
        tagging: {
            is_running: false,
            status_message: '',
            progress: { current: 0, total: 0 },
            log: '',
            available: false,
        },
    }),
    getJobsQueue: async () => ({ queue_depth: 0, jobs: [] }),
    cancelJob: async () => ({ success: false, message: 'folder mode' }),
    getScopeTree: async () => ({ folders: [] }),
};

// ── HTTP Bridge (browser mode) ────────────────────────────────────────────────

function createHttpBridge(): Window['electron'] {
    return {
        ping: () => get('/ping'),

        checkDbConnection: () => get('/db/check-connection'),

        getImageCount: (options?) => get('/db/image-count', options as Record<string, unknown> | undefined),

        getImages: (options?) => get('/db/images', options as Record<string, unknown> | undefined),

        getImageDetails: (id) => get(`/db/image/${id}`),

        updateImageDetails: (id, updates) => post(`/db/image/${id}`, updates),

        deleteImage: (id) => del(`/db/image/${id}`),

        deleteFolder: (id) => del(`/db/folder/${id}`),

        getFolders: () => get('/db/folders'),

        getKeywords: () => get('/db/keywords'),

        findNearDuplicates: (options?) => post('/db/near-duplicates', options ?? {}),

        searchSimilarImages: (options) => post('/db/similar', options),

        findOutliers: (options) => post('/db/outliers', options),

        getStacks: (options?) => get('/db/stacks', options as Record<string, unknown> | undefined),

        getImagesByStack: (stackId, options?) =>
            get(`/db/stacks/${stackId ?? 'null'}/images`, options as Record<string, unknown> | undefined),

        getStackCount: (options?) => get('/db/stack-count', options as Record<string, unknown> | undefined),

        rebuildStackCache: (context) => post('/db/rebuild-stack-cache', context ?? {}),

        log: (level, message, data?) => {
            const args = data !== undefined ? [message, data] : [message];
            if (level === 'error') console.error(...args);
            else if (level === 'warn') console.warn(...args);
            else console.log(...args);
            return Promise.resolve(true);
        },

        // Not supported in browser mode — RAW preview extraction requires Electron native modules.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        extractNefPreview: (_filePath: string) =>
            Promise.resolve({ success: false, fallback: true, error: 'Not available in browser mode' }),

        getApiPort: async () => {
            const cfg = await get<{ url: string }>('/api-config');
            const match = cfg.url.match(/:(\d+)(?:\/|$)/);
            return match ? parseInt(match[1], 10) : 7860;
        },

        getApiConfig: () => get('/api-config'),

        getConfig: () => get('/config'),

        saveConfig: (updates) => post('/config', updates),

        // Not supported in browser mode — export context is Electron menu-driven.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        setCurrentExportImageContext: (_context: Parameters<Window['electron']['setCurrentExportImageContext']>[0]) => Promise.resolve(true),

        // Not supported in browser mode — EXIF extraction requires Electron native modules.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        readExif: (_filePath: string) => Promise.resolve({}),

        readImageMetadata: (_filePath: string) => Promise.resolve(emptyFileImageMetadata()),

        getLightModeRoot: () => Promise.reject(new Error('Not available in browser mode')),

        readFsDir: () =>
            Promise.reject(new Error('Filesystem gallery is only available in the Electron app')),

        setGalleryMode: () => Promise.reject(new Error('Not available in browser mode')),

        getGalleryMode: () => Promise.resolve('db'),

        onAppModeChanged: noop,

        selectDirectory: () => Promise.resolve(null),

        getDiagnostics: async () => {
            const apiCfg = await get<{ url: string }>('/api-config');
            let apiConnected = false;
            try {
                const res = await fetch(apiCfg.url + '/health', { signal: AbortSignal.timeout(3000) });
                apiConnected = res.ok;
            } catch { /* unreachable backend */ }
            return {
                os: { platform: 'browser', release: '', arch: '', uptime: 0 },
                versions: { electron: 'N/A (browser)', node: 'N/A', chrome: navigator.userAgent, v8: 'N/A' },
                database: { engine: 'firebird', connected: true, host: window.location.hostname, database: 'via server' },
                api: { url: apiCfg.url, connected: apiConnected },
                memory: null,
            };
        },

        getProcessMemoryInfo: () => Promise.resolve(null),

        // Event listeners are Electron menu/dialog-driven; no-ops in browser mode.
        onOpenSettings: noop,
        onOpenDuplicates: noop,
        onOpenRuns: noop,
        onOpenEmbeddings: noop,
        onOpenDiagnostics: noop,
        onImportFolderSelected: noop,
        onImportProgress: noop,
        onShowNotification: noop,

        importRun: (folderPath) => post('/import/run', { folderPath }),

        api: {
            healthCheck: () => post('/backend/health'),
            isAvailable: async () => { try { await post('/backend/health'); return true; } catch { return false; } },
            getStatus: () => get('/backend/status'),
            getStats: () => get('/backend/stats'),

            startScoring: (opts) => post('/backend/scoring/start', opts),
            stopScoring: () => post('/backend/scoring/stop'),
            getScoringStatus: () => get('/backend/scoring/status'),
            scoreSingleImage: (filePath) => post('/backend/scoring/single', { file_path: filePath }),

            startTagging: (opts) => post('/backend/tagging/start', opts),
            stopTagging: () => post('/backend/tagging/stop'),
            getTaggingStatus: () => get('/backend/tagging/status'),
            tagSingleImage: (opts) => post('/backend/tagging/single', opts),
            propagateTags: (opts) => post('/backend/tagging/propagate', opts),

            startClustering: (opts) => post('/backend/clustering/start', opts),
            stopClustering: () => post('/backend/clustering/stop'),
            getClusteringStatus: () => get('/backend/clustering/status'),

            submitPipeline: (opts) => post('/backend/pipeline/submit', opts),
            skipPipelinePhase: (opts) => post('/backend/pipeline/phase/skip', opts),
            retryPipelinePhase: (opts) => post('/backend/pipeline/phase/retry', opts),

            getRecentJobs: () => get('/backend/jobs/recent'),
            getJobDetail: (jobId) => get(`/backend/jobs/${jobId}`),
            getAllStatus: () => get('/backend/status'),
            getJobsQueue: (limit?) =>
                get('/backend/jobs/queue', limit !== undefined ? { limit } : undefined),
            cancelJob: (jobId) => post(`/backend/jobs/${jobId}/cancel`),

            getScopeTree: () => get('/backend/scope/tree', { include_phase_status: false }),
        },
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

const _httpBridge = createHttpBridge();

/**
 * The bridge object. In Electron it is a pass-through to `window.electron`;
 * in a plain browser it uses HTTP fetch to the Express server.
 *
 * Implemented as a Proxy so that `window.electron` is checked at call time,
 * not at module-load time. This allows tests to inject `window.electron`
 * after the module is imported (via beforeEach) and have it picked up correctly.
 */
const FOLDER_TOP_STUBS: Partial<Record<keyof Window['electron'], (...args: unknown[]) => unknown>> = {
    checkDbConnection: () => Promise.resolve(false),
    getImageCount: () => Promise.resolve(0),
    getImages: () => Promise.resolve([]),
    getFolders: () => Promise.resolve([]),
    getKeywords: () => Promise.resolve([]),
    getStacks: () => Promise.resolve([]),
    getStackCount: () => Promise.resolve(0),
    getImagesByStack: () => Promise.resolve([]),
    getImageDetails: () => Promise.resolve(null),
    updateImageDetails: () => Promise.resolve(false),
    deleteImage: () => Promise.resolve(false),
    deleteFolder: () => Promise.resolve(false),
    findNearDuplicates: () =>
        Promise.resolve({ success: false, data: { duplicates: [] }, message: 'folder mode' }),
    searchSimilarImages: () =>
        Promise.resolve({
            query_image_id: 0,
            results: [],
            count: 0,
            error: 'folder mode',
        }),
    findOutliers: () =>
        Promise.resolve({
            outliers: [],
            stats: {},
            skipped: [],
        }),
    rebuildStackCache: () => Promise.resolve({ success: false, count: 0 }),
    importRun: () => Promise.resolve({ added: 0, skipped: 0, errors: [] }),
};

export const bridge: Window['electron'] = new Proxy({} as Window['electron'], {
    get(_target, prop: string | symbol) {
        const source: Window['electron'] =
            typeof window !== 'undefined' && window.electron
                ? window.electron
                : _httpBridge;
        const folderStubs = useFolderModeStubs();

        if (prop === 'api') {
            return new Proxy({} as Window['electron']['api'], {
                get(_t, apiProp: string | symbol) {
                    if (folderStubs) {
                        const stub = (FOLDER_API_STUB as Record<string | symbol, unknown>)[apiProp];
                        if (typeof stub === 'function') {
                            return (stub as (...a: unknown[]) => unknown).bind(FOLDER_API_STUB);
                        }
                        return stub;
                    }
                    const apiSource = source.api;
                    const apiValue = (apiSource as Record<string | symbol, unknown>)[apiProp];
                    return typeof apiValue === 'function'
                        ? (apiValue as (...a: unknown[]) => unknown).bind(apiSource)
                        : apiValue;
                },
            });
        }

        if (folderStubs) {
            const stubFn = FOLDER_TOP_STUBS[prop as keyof Window['electron']];
            if (typeof stubFn === 'function') {
                return stubFn.bind(null);
            }
        }

        const value = (source as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function'
            ? (value as (...a: unknown[]) => unknown).bind(source)
            : value;
    },
});

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
export const bridge: Window['electron'] = new Proxy({} as Window['electron'], {
    get(_target, prop: string | symbol) {
        const source: Window['electron'] =
            typeof window !== 'undefined' && window.electron
                ? window.electron
                : _httpBridge;
        const value = (source as Record<string | symbol, unknown>)[prop];
        if (prop === 'api') {
            // Proxy the nested api object too so api.xxx checks window.electron lazily
            return new Proxy({} as Window['electron']['api'], {
                get(_t, apiProp: string | symbol) {
                    const apiSource: Window['electron'] =
                        typeof window !== 'undefined' && window.electron
                            ? window.electron
                            : _httpBridge;
                    const apiValue = (apiSource.api as Record<string | symbol, unknown>)[apiProp];
                    return typeof apiValue === 'function'
                        ? (apiValue as (...a: unknown[]) => unknown).bind(apiSource.api)
                        : apiValue;
                },
            });
        }
        return typeof value === 'function'
            ? (value as (...a: unknown[]) => unknown).bind(source)
            : value;
    },
});

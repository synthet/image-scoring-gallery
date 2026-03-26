/**
 * Centralized REST API client for the Python backend (FastAPI at :7860).
 * All HTTP calls to the backend go through this service.
 *
 * Runs in the Electron main process using `net.fetch()`, or in a plain Node.js
 * server using `globalThis.fetch` (Node 18+). The fetch implementation is
 * resolved lazily so this module can be imported in both contexts.
 */

import { resolveBaseUrl } from './apiUrlResolver';
import type {
    ApiResponse,
    HealthResponse,
    StatusResponse,
    AllRunnersStatus,
    ScoringStartRequest,
    SingleImageRequest,
    TaggingStartRequest,
    TaggingSingleRequest,
    TagPropagationRequest,
    ClusteringStartRequest,
    FindDuplicatesRequest,
    SimilarSearchParams,
    SimilarSearchResult,
    OutlierSearchParams,
    OutlierSearchResult,
    ImportRegisterRequest,
    ImportRegisterResponse,
    PipelineSubmitRequest,
    PipelinePhaseControlRequest,
    QueueResponse,
    PhaseDecisionResponse,
    JobInfo,
    DatabaseStats,
    ScopeTreeResponse,
} from './apiTypes';
import type { AppConfig } from './types';

const DEFAULT_TIMEOUT = 10_000;   // 10s for quick operations
const LONG_TIMEOUT = 120_000;     // 2min for batch job starts

/**
 * Resolves the fetch implementation at runtime.
 * In Electron main process: uses `net.fetch` for proper session/proxy support.
 * In Node.js (Express server): falls back to `globalThis.fetch` (Node 18+).
 */
function resolveFetch(): (url: string, options?: RequestInit) => Promise<Response> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { net } = require('electron') as { net: { fetch: (url: string, options?: RequestInit) => Promise<Response> } };
        return net.fetch.bind(net);
    } catch {
        return globalThis.fetch.bind(globalThis) as (url: string, options?: RequestInit) => Promise<Response>;
    }
}

export class ApiService {
    private baseUrl: string | null = null;
    private configLoader: () => AppConfig;

    constructor(configLoader: () => AppConfig) {
        this.configLoader = configLoader;
    }

    // ── URL Resolution ──────────────────────────────────────────────────────

    private resolveBaseUrl(): string {
        if (this.baseUrl) return this.baseUrl;
        this.baseUrl = resolveBaseUrl(this.configLoader());
        return this.baseUrl;
    }

    /** Returns the resolved base URL for the Python backend. */
    public getBaseUrl(): string {
        return this.resolveBaseUrl();
    }

    /** Force re-resolution on next call (e.g. after config change). */
    public resetBaseUrl(): void {
        this.baseUrl = null;
    }

    // ── Generic HTTP ────────────────────────────────────────────────────────

    private async request<T>(
        method: 'GET' | 'POST',
        apiPath: string,
        options?: {
            body?: unknown;
            params?: Record<string, string | number | boolean | undefined>;
            timeout?: number;
        },
    ): Promise<T> {
        const base = this.resolveBaseUrl();
        const url = new URL(apiPath, base);

        // Append query params for GET requests
        if (options?.params) {
            for (const [key, value] of Object.entries(options.params)) {
                if (value !== undefined && value !== null) {
                    url.searchParams.append(key, String(value));
                }
            }
        }

        const controller = new AbortController();
        const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const fetchOptions: RequestInit = {
                method,
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
            };

            if (method === 'POST' && options?.body !== undefined) {
                fetchOptions.body = JSON.stringify(options.body);
            }

            const response = await resolveFetch()(url.toString(), fetchOptions);

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(
                    `API ${method} ${apiPath} returned HTTP ${response.status}${errorText ? `: ${errorText}` : ''}`,
                );
            }

            return (await response.json()) as T;
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`API ${method} ${apiPath} timed out after ${timeoutMs}ms`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    private get<T>(apiPath: string, params?: Record<string, string | number | boolean | undefined>, timeout?: number) {
        return this.request<T>('GET', apiPath, { params, timeout });
    }

    private post<T>(apiPath: string, body?: unknown, timeout?: number) {
        return this.request<T>('POST', apiPath, { body, timeout });
    }

    // ── Health & Status ─────────────────────────────────────────────────────

    healthCheck() {
        return this.get<HealthResponse>('/api/health');
    }

    getStatus() {
        return this.get<StatusResponse>('/api/status');
    }

    getSchema() {
        return this.get<unknown>('/api/schema');
    }

    /**
     * Quick connectivity test. Returns true if backend responds, false otherwise.
     */
    async isAvailable(): Promise<boolean> {
        try {
            await this.healthCheck();
            return true;
        } catch {
            return false;
        }
    }

    // ── Scoring ─────────────────────────────────────────────────────────────

    startScoring(opts: ScoringStartRequest) {
        return this.post<ApiResponse>('/api/scoring/start', opts, LONG_TIMEOUT);
    }

    stopScoring() {
        return this.post<ApiResponse>('/api/scoring/stop');
    }

    getScoringStatus() {
        return this.get<StatusResponse>('/api/scoring/status');
    }

    scoreSingleImage(filePath: string) {
        const body: SingleImageRequest = { file_path: filePath };
        return this.post<ApiResponse>('/api/scoring/single', body, LONG_TIMEOUT);
    }

    fixScoringDb() {
        return this.post<ApiResponse>('/api/scoring/fix-db', undefined, LONG_TIMEOUT);
    }

    fixImage(filePath: string) {
        return this.post<ApiResponse>('/api/scoring/fix-image', { file_path: filePath }, LONG_TIMEOUT);
    }

    // ── Tagging ─────────────────────────────────────────────────────────────

    startTagging(opts: TaggingStartRequest) {
        return this.post<ApiResponse>('/api/tagging/start', opts, LONG_TIMEOUT);
    }

    stopTagging() {
        return this.post<ApiResponse>('/api/tagging/stop');
    }

    getTaggingStatus() {
        return this.get<StatusResponse>('/api/tagging/status');
    }

    tagSingleImage(opts: TaggingSingleRequest) {
        return this.post<ApiResponse>('/api/tagging/single', opts, LONG_TIMEOUT);
    }

    propagateTags(opts: TagPropagationRequest) {
        return this.post<ApiResponse>('/api/tagging/propagate', opts, LONG_TIMEOUT);
    }

    // ── Clustering ──────────────────────────────────────────────────────────

    startClustering(opts: ClusteringStartRequest) {
        return this.post<ApiResponse>('/api/clustering/start', opts, LONG_TIMEOUT);
    }

    stopClustering() {
        return this.post<ApiResponse>('/api/clustering/stop');
    }

    getClusteringStatus() {
        return this.get<StatusResponse>('/api/clustering/status');
    }

    // ── Import ──────────────────────────────────────────────────────────────

    importRegister(opts: ImportRegisterRequest) {
        return this.post<ImportRegisterResponse>('/api/import/register', opts, LONG_TIMEOUT);
    }

    // ── Pipeline ────────────────────────────────────────────────────────────

    submitPipeline(opts: PipelineSubmitRequest) {
        return this.post<ApiResponse>('/api/pipeline/submit', opts, LONG_TIMEOUT);
    }

    skipPipelinePhase(opts: PipelinePhaseControlRequest) {
        return this.post<ApiResponse>('/api/pipeline/phase/skip', opts, LONG_TIMEOUT);
    }

    retryPipelinePhase(opts: PipelinePhaseControlRequest) {
        return this.post<ApiResponse>('/api/pipeline/phase/retry', opts, LONG_TIMEOUT);
    }

    getPhaseDecision(params: { image_id: number; phase_code: string; current_executor_version?: string; force_run?: boolean }) {
        return this.get<PhaseDecisionResponse>('/api/phases/decision', params);
    }

    // ── Duplicates & Similarity ─────────────────────────────────────────────

    findDuplicates(opts?: FindDuplicatesRequest) {
        return this.post<ApiResponse>('/api/duplicates/find', opts ?? {}, LONG_TIMEOUT);
    }

    searchSimilar(opts: SimilarSearchParams) {
        return this.get<SimilarSearchResult>(
            '/api/similar',
            {
                image_id: opts.image_id,
                limit: opts.limit,
                folder_path: opts.folder_path,
                min_similarity: opts.min_similarity,
            },
            LONG_TIMEOUT,
        );
    }

    getOutliers(opts: OutlierSearchParams) {
        return this.get<OutlierSearchResult>(
            '/api/outliers',
            {
                folder_path: opts.folder_path,
                z_threshold: opts.z_threshold,
                k: opts.k,
                limit: opts.limit,
            },
            LONG_TIMEOUT,
        );
    }

    // ── Data (read-only) ────────────────────────────────────────────────────

    getImages(params?: Record<string, string | number | boolean | undefined>) {
        return this.get<unknown>('/api/images', params);
    }

    getImageById(id: number) {
        return this.get<unknown>(`/api/images/${id}`);
    }

    getFolders() {
        return this.get<unknown>('/api/folders');
    }

    rebuildFolders() {
        return this.post<ApiResponse>('/api/folders/rebuild', undefined, LONG_TIMEOUT);
    }

    getStacks() {
        return this.get<unknown>('/api/stacks');
    }

    getStackImages(stackId: number) {
        return this.get<unknown>(`/api/stacks/${stackId}/images`);
    }

    getStats() {
        return this.get<DatabaseStats>('/api/stats');
    }

    /** Returns combined status for all runners (scoring + tagging). */
    getAllStatus() {
        return this.get<AllRunnersStatus>('/api/status');
    }

    // ── Jobs ────────────────────────────────────────────────────────────────

    getJobsQueue(limit?: number) {
        return this.get<QueueResponse>('/api/jobs/queue', limit !== undefined ? { limit } : undefined);
    }

    cancelJob(jobId: string | number) {
        return this.post<ApiResponse>(`/api/jobs/${jobId}/cancel`);
    }

    getRecentJobs() {
        return this.get<JobInfo[]>('/api/jobs/recent').then((jobs) =>
            jobs.map((j) => ({ ...j, job_id: j.job_id ?? j.id }))
        );
    }

    getJob(jobId: string | number) {
        return this.get<JobInfo>(`/api/jobs/${jobId}`).then((j) => ({
            ...j,
            job_id: j.job_id ?? j.id,
        }));
    }

    // ── Preview ─────────────────────────────────────────────────────────────

    getRawPreview(filePath: string) {
        return this.get<unknown>('/api/raw-preview', { path: filePath });
    }

    // ── Scope Tree ──────────────────────────────────────────────────────────

    getScopeTree() {
        return this.get<ScopeTreeResponse>('/api/scope/tree', { include_phase_status: false }, LONG_TIMEOUT);
    }
}

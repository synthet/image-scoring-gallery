/**
 * TypeScript interfaces for the Python backend REST API.
 * Mirrors the FastAPI Pydantic models in modules/api.py.
 *
 * Machine-generated types from the OpenAPI schema live in api.generated.ts.
 * Run `npm run generate:api-types` after backend schema changes.
 * See docs/technical/API_CONTRACT.md for the full contract.
 *
 * Migration: Use generated types in new code; migrate existing consumers
 * incrementally when touching them.
 */

// ── Standard response envelope ──────────────────────────────────────────────

export interface ApiResponse {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
}

// ── Health & Status ─────────────────────────────────────────────────────────

export interface HealthResponse {
    status: string;
    scoring_available: boolean;
    tagging_available: boolean;
    clustering_available: boolean;
}

export interface StatusResponse {
    is_running: boolean;
    status_message: string;
    progress: { current: number; total: number };
    log: string;
    job_type?: string | null;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export interface ScoringStartRequest {
    input_path: string;
    skip_existing?: boolean;
    force_rescore?: boolean;
}

export interface SingleImageRequest {
    file_path: string;
}

// ── Tagging ─────────────────────────────────────────────────────────────────

export interface TaggingStartRequest {
    input_path: string;
    custom_keywords?: string[] | null;
    overwrite?: boolean;
    generate_captions?: boolean;
}

export interface TaggingSingleRequest {
    file_path: string;
    custom_keywords?: string[] | null;
    generate_captions?: boolean;
}

export interface TagPropagationRequest {
    folder_path?: string | null;
    dry_run?: boolean;
    k?: number | null;
    min_similarity?: number | null;
    min_keyword_confidence?: number | null;
    min_support_neighbors?: number | null;
    write_mode?: 'replace_missing_only' | 'append' | null;
    max_keywords?: number | null;
}

// ── Clustering ──────────────────────────────────────────────────────────────

export interface ClusteringStartRequest {
    input_path?: string | null;
    threshold?: number | null;
    time_gap?: number | null;
    force_rescan?: boolean;
}

// ── Duplicates ──────────────────────────────────────────────────────────────

export interface FindDuplicatesRequest {
    threshold?: number | null;
    folder_path?: string | null;
    limit?: number | null;
}

// ── Similar Images ──────────────────────────────────────────────────────────

export interface SimilarSearchParams {
    image_id: number;
    limit?: number;
    folder_path?: string;
    min_similarity?: number;
}

export interface SimilarSearchResult {
    query_image_id: number;
    results: Array<{
        image_id: number;
        file_path: string;
        similarity: number;
        [key: string]: unknown;
    }>;
    count: number;
}

// ── Outlier Detection ──────────────────────────────────────────────────────

export interface OutlierSearchParams {
    folder_path: string;
    z_threshold?: number;
    k?: number;
    limit?: number;
}

export interface NeighborInfo {
    image_id: number;
    file_path: string;
    similarity: number;
}

export interface OutlierInfo {
    image_id: number;
    file_path: string;
    outlier_score: number;
    z_score: number;
    nearest_neighbors: NeighborInfo[];
}

export interface OutlierSearchResult {
    outliers: OutlierInfo[];
    stats: Record<string, unknown>;
    skipped: Array<Record<string, unknown>>;
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface ImportRegisterRequest {
    folder_path: string;
}

export interface ImportRegisterResponse {
    success: boolean;
    message: string;
    data?: { added: number; skipped: number; errors: string[] };
}

// ── Pipeline ────────────────────────────────────────────────────────────────

export interface PipelinePhaseControlRequest {
    input_path: string;
    /** Phase code as used by backend: 'indexing' | 'metadata' | 'score' | 'tag' | 'cluster' */
    phase_code: string;
    reason?: string | null;
    actor?: string | null;
}

export interface PipelineSubmitRequest {
    input_path: string;
    operations?: string[];
    skip_existing?: boolean;
    custom_keywords?: string[] | null;
    generate_captions?: boolean;
    clustering_threshold?: number | null;
}

// ── All-runners status ───────────────────────────────────────────────────────

export interface AllRunnersStatus {
    scoring: StatusResponse & { available?: boolean };
    tagging: StatusResponse & { available?: boolean };
    [key: string]: unknown;
}

// ── Jobs ────────────────────────────────────────────────────────────────────

/** Matches jobs table / db.get_jobs(). API returns `id` (not job_id). Use id ?? job_id for the primary key. */
export interface JobInfo {
    id?: number;
    job_id?: string | number;
    job_type?: string;
    input_path?: string;
    status: string;
    created_at?: string;
    completed_at?: string;
    log?: string;
    progress?: { current: number; total: number };
    [key: string]: unknown;
}

// ── Queue ────────────────────────────────────────────────────────────────────

export interface QueueResponse {
    queue_depth: number;
    jobs: JobInfo[];
    [key: string]: unknown;
}

// ── Stats ───────────────────────────────────────────────────────────────────

/** Matches get_database_stats() from modules/mcp_server.py. Does not include scored_images or tagged_images. */
export interface DatabaseStats {
    total_images: number;
    by_rating: Record<string, number>;
    by_label: Record<string, number>;
    score_distribution: Record<string, number>;
    average_scores: {
        general: number;
        technical: number;
        aesthetic: number;
        spaq: number;
        koniq: number;
        liqe: number;
    };
    total_folders: number;
    total_stacks: number;
    jobs_by_status: Record<string, number>;
    images_today: number;
    error?: string;
    [key: string]: unknown;
}

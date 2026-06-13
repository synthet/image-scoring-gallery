/** Types for GET /api/analytics/culling and related endpoints. */

export interface CullingAnalyticsResponse {
    scope: 'library' | 'session' | 'stack';
    generated_at?: string;
    folder_id?: number | null;
    folder_path?: string | null;
    session_id?: number;
    stack_id?: number;
    error?: string;
    stack_size?: StackSizeStats;
    flags?: CullingFlagsStats;
    scores?: CullingScoresBlock;
    exposure?: Record<string, unknown>;
    labels?: Record<string, unknown>;
    gps?: Record<string, unknown>;
    keywords?: Record<string, unknown>;
    embeddings?: Record<string, unknown>;
    composite?: CullingCompositeStats;
    warnings?: string[];
    member_count?: number;
    decisions?: { pick?: number; reject?: number; neutral?: number };
    [key: string]: unknown;
}

export interface StackSizeStats {
    total_stacks?: number;
    total_stacked_images?: number;
    unstacked_images?: number;
    singleton_stacks?: number;
    singleton_pct?: number;
    very_large_stacks?: number;
    avg?: number | null;
    median?: number | null;
    size_buckets?: Record<string, number>;
}

export interface CullingFlagsStats {
    pick_count?: number;
    reject_count?: number;
    neutral_count?: number;
    pick_pct?: number;
    reject_pct?: number;
    stacks_needing_review?: number;
    flag_layer?: string;
}

export interface CullingScoresBlock {
    by_field?: Record<string, unknown>;
    per_stack_summary?: Array<Record<string, unknown>>;
}

export interface CullingCompositeStats {
    stack_consistency_score?: number;
    review_priority_score?: number;
    auto_pick_confidence?: number;
    auto_reject_confidence?: number;
}

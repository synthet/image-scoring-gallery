export type AgentCullCandidateStatus =
    | 'none'
    | 'proposed'
    | 'agent_remove_candidate'
    | 'operator_approved'
    | 'operator_rejected'
    | 'rolled_back';

export type AgentCullGroupStatus =
    | 'discovered'
    | 'payload_built'
    | 'agent_pending'
    | 'agent_done'
    | 'validated'
    | 'proposed'
    | 'applied'
    | 'failed'
    | 'rolled_back';

export interface AgentCullRecommendation {
    id: number;
    review_group_id: number;
    image_id: number;
    agent_decision: 'remove' | 'keep' | 'uncertain';
    final_decision: 'remove' | 'keep' | 'uncertain';
    confidence?: number | null;
    reason?: string | null;
    better_alternatives?: number[] | null;
    risk_flags?: string[] | null;
    safety_overrides?: Array<{ gate: string; scope: string; image_id?: number }> | null;
    candidate_status: AgentCullCandidateStatus;
}

export interface AgentCullReviewGroupSummary {
    id: number;
    stack_id: number;
    sub_stack_id?: number | null;
    review_unit_key: string;
    status: AgentCullGroupStatus;
    dry_run?: boolean;
    group_decision?: string | null;
    group_confidence?: number | null;
    summary?: string | null;
    safety_overrides?: Array<{ gate: string; scope: string }> | null;
    error_code?: string | null;
    error_message?: string | null;
}

export interface AgentCullReviewGroupDetail extends AgentCullReviewGroupSummary {
    recommendations?: AgentCullRecommendation[];
    request_json?: Record<string, unknown> | null;
    response_validated?: Record<string, unknown> | null;
}

export interface AgentCullGroupsListResponse {
    groups: AgentCullReviewGroupSummary[];
}

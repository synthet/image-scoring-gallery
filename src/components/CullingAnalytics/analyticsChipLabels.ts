/** User-facing labels for culling analytics banner chips and agent review badges. */

export type AnalyticsChip = { key: string; text: string; warn?: boolean };

const WARNING_LABELS: Record<string, string> = {
    mixed_color_labels: 'Mixed color labels',
    visually_mixed_stack: 'Mixed subjects',
    mixed_camera: 'Mixed cameras',
    mixed_lens: 'Mixed lenses',
    likely_bracket: 'Likely bracketed exposure',
};

const WARNING_COUNT_LABELS: Record<string, (count: number) => string> = {
    pick_status_cull_decision_disagree: (n) => `Pick flags disagree with auto-cull (${n})`,
    stacks_over_pick_cap_20: (n) => `Stacks over 20-pick limit (${n})`,
    substacks_picks_over_m3: (n) => `Sub-stacks over 3-pick limit (${n})`,
    giant_substack_leaves_over_50: (n) => `Large sub-stacks over 50 images (${n})`,
};

export function humanizeSnakeCase(value: string): string {
    return value
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

/** Maps backend warning codes (and stack-prefixed variants) to operator-facing chip text. */
export function formatAnalyticsWarning(raw: string): { text: string; warn: boolean } {
    const stackScoped = /^stack:\d+:(.+)$/.exec(raw);
    const code = stackScoped ? stackScoped[1] : raw;

    const colonIdx = code.indexOf(':');
    if (colonIdx > 0) {
        const prefix = code.slice(0, colonIdx);
        const count = Number.parseInt(code.slice(colonIdx + 1), 10);
        const formatter = WARNING_COUNT_LABELS[prefix];
        if (formatter && !Number.isNaN(count)) {
            return { text: formatter(count), warn: true };
        }
    }

    const label = WARNING_LABELS[code];
    if (label) {
        return { text: label, warn: true };
    }

    return { text: humanizeSnakeCase(code), warn: true };
}

export function formatDecisionChip(type: 'pick' | 'reject' | 'neutral', count: number): AnalyticsChip {
    const textByType = {
        pick: `Pick ${count}`,
        reject: `Reject ${count}`,
        neutral: `Neutral ${count}`,
    } as const;
    return {
        key: `decision-${type}`,
        text: textByType[type],
        warn: type === 'reject',
    };
}

const AGENT_GROUP_STATUS_LABELS: Record<string, string> = {
    discovered: 'Discovered',
    payload_built: 'Payload ready',
    agent_pending: 'Awaiting agent',
    agent_done: 'Agent finished',
    validated: 'Validated',
    proposed: 'Proposed',
    applied: 'Applied',
    failed: 'Failed',
    rolled_back: 'Rolled back',
};

const AGENT_CANDIDATE_STATUS_LABELS: Record<string, string> = {
    proposed: 'Proposed',
    agent_remove_candidate: 'Remove candidate',
    pick_quality_advisory: 'Quality advisory',
    operator_approved: 'Approved',
    operator_rejected: 'Rejected',
    operator_deleted: 'Deleted',
    rolled_back: 'Rolled back',
};

const AGENT_DECISION_LABELS: Record<string, string> = {
    remove: 'Remove',
    keep: 'Keep',
    uncertain: 'Uncertain',
    advisory: 'Advisory',
};

export function friendlyAgentGroupStatus(status: string): string {
    return AGENT_GROUP_STATUS_LABELS[status] ?? humanizeSnakeCase(status);
}

export function friendlyAgentCandidateStatus(status: string): { text: string; warn: boolean } {
    const text = AGENT_CANDIDATE_STATUS_LABELS[status] ?? humanizeSnakeCase(status);
    const warn = status === 'agent_remove_candidate' || status === 'operator_rejected';
    return { text, warn };
}

export function friendlyAgentDecision(decision: string): string {
    return AGENT_DECISION_LABELS[decision] ?? humanizeSnakeCase(decision);
}

/**
 * Visual tone for a recommendation card / grid overlay, aligned with design tokens:
 *  - remove   → amber/warning (suggested removal awaiting operator)
 *  - advisory → blue/info (picked-image quality note, never removes)
 *  - approved → green/success (operator approved the removal)
 *  - rejected → red/danger (operator dismissed / kept in review)
 *  - neutral  → muted (no decision yet / rolled back)
 */
export type AgentRecommendationTone = 'remove' | 'advisory' | 'approved' | 'rejected' | 'neutral';

interface AgentRecLike {
    agent_decision?: string | null;
    final_decision?: string | null;
    candidate_status?: string | null;
}

/** True when a recommendation is advisory-only (info, never approvable/removable). */
export function isAdvisoryRecommendation(rec: AgentRecLike): boolean {
    return rec.agent_decision === 'advisory' || rec.candidate_status === 'pick_quality_advisory';
}

export function agentRecommendationTone(rec: AgentRecLike): AgentRecommendationTone {
    switch (rec.candidate_status) {
        case 'operator_approved':
            return 'approved';
        case 'operator_rejected':
            return 'rejected';
        case 'rolled_back':
            return 'neutral';
        default:
            break;
    }
    if (isAdvisoryRecommendation(rec)) return 'advisory';
    if (rec.final_decision === 'remove') return 'remove';
    return 'neutral';
}

/** Short, scannable label for a recommendation's headline badge. */
export function agentRecommendationBadge(rec: AgentRecLike): string {
    const tone = agentRecommendationTone(rec);
    switch (tone) {
        case 'approved':
            return 'Approved';
        case 'rejected':
            return 'Dismissed';
        case 'advisory':
            return 'Advisory';
        case 'remove':
            return 'Remove';
        default:
            return friendlyAgentDecision(rec.final_decision ?? 'keep');
    }
}

/**
 * Condenses a verbose agent summary into a scannable digest: the first sentence,
 * capped at `maxLen` chars. Returns `hasMore` when text was elided so the caller
 * can offer a "Show full analysis" toggle. Embedded score tokens like `(0.93)`
 * are collapsed to keep the digest prose-only.
 */
export function formatAgentSummaryDigest(
    summary: string | null | undefined,
    maxLen = 200,
): { digest: string; hasMore: boolean } {
    const full = (summary ?? '').trim();
    if (!full) return { digest: '', hasMore: false };

    const condensed = full.replace(/\s*\((?:score\s*)?\d+(?:\.\d+)?\)\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();

    // Prefer ending at the first sentence boundary when it is reasonably short.
    const sentenceEnd = condensed.search(/[.!?](\s|$)/);
    if (sentenceEnd >= 0 && sentenceEnd + 1 <= maxLen) {
        const digest = condensed.slice(0, sentenceEnd + 1).trim();
        return { digest, hasMore: digest.length < full.length };
    }

    if (condensed.length <= maxLen) {
        return { digest: condensed, hasMore: condensed.length < full.length };
    }

    // Hard cap on a word boundary.
    const slice = condensed.slice(0, maxLen);
    const lastSpace = slice.lastIndexOf(' ');
    const digest = (lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
    return { digest: `${digest}…`, hasMore: true };
}

/** Maps agent-review API error and skip_reason codes to operator-facing text. */
const AGENT_ERROR_LABELS: Record<string, string> = {
    stale_group_state:
        'Picks changed since this review was generated. Re-run the dry-run review to refresh recommendations before applying.',
    dry_run_group:
        'This is a dry-run review — candidates can’t be marked. Re-run the review without dry-run to apply.',
    agent_review_disabled: 'Agent cull review is disabled in the backend configuration.',
    no_eligible_unit: 'This stack isn’t eligible for agent review.',
    insufficient_usable_images: 'Too few readable files or thumbnails for vision review.',
    group_too_large: 'Group exceeds the configured max size (default 9).',
    no_picked_images: 'Need at least one picked image.',
    no_rejected_images: 'Need at least one rejected image.',
    singleton_root: 'Single-image stacks are not eligible.',
    ineligible: 'This stack isn’t eligible for agent review.',
    existing_review:
        'A review already exists for this unit. Re-run with force or open the existing group.',
    agent_cli_not_found:
        'The agent CLI was not found on PATH for the backend WebUI. Install the Gemini CLI (or set culling.agent_review.agent.command in config.json to the full executable path), then restart the WebUI.',
    agent_cli_spawn_failed: 'The backend could not start the configured agent CLI.',
    agent_cli_auth_tier:
        'Gemini CLI rejected this client tier (individual Code Assist may no longer be supported). Re-authenticate or migrate to a supported Gemini/Antigravity plan, then restart the WebUI.',
    agent_cli_auth_failed:
        'The agent CLI is not authenticated for the backend WebUI. For Antigravity: install agy on the host, sign in once, mount ~/.gemini via GEMINI_CONFIG_SOURCE, or set GEMINI_API_KEY / ANTIGRAVITY_API_KEY in Docker .env. For Gemini legacy: run `gemini auth` (option 2 API key if Google sign-in is blocked).',
    agent_cli_quota_exhausted:
        'Gemini CLI reported quota exhaustion. Check billing/limits or retry later.',
    exit_code_127:
        'The agent bridge script could not run in the WebUI container (often Windows CRLF line endings in scripts/wsl/*.sh). Normalize to LF and restart the WebUI.',
    timeout: 'The agent CLI timed out. Retry or increase culling.agent_review.agent.timeout_seconds in config.json.',
    agent_review_load_timeout:
        'Could not load agent review status — the backend may still be running a review. Wait a moment and try again.',
    malformed_json: 'The agent CLI did not return parseable JSON. Retry, or check the failed review group in the backend logs.',
    schema_invalid: 'The agent CLI returned JSON that failed validation. Check the group response in the backend logs or DB.',
};

export function friendlyAgentReviewFailure(
    errorCode?: string | null,
    errorMessage?: string | null,
): string | null {
    if (!errorCode && !errorMessage) return null;
    if (errorCode && AGENT_ERROR_LABELS[errorCode]) {
        return AGENT_ERROR_LABELS[errorCode];
    }
    if (errorCode?.startsWith('exit_code_') && errorMessage) {
        return friendlyAgentError(errorMessage);
    }
    if (errorCode) {
        return friendlyAgentError(errorCode);
    }
    return errorMessage ?? null;
}

export function friendlyAgentError(raw: string, skipReason?: string | null): string {
    if (skipReason && AGENT_ERROR_LABELS[skipReason]) {
        return AGENT_ERROR_LABELS[skipReason];
    }
    for (const [code, msg] of Object.entries(AGENT_ERROR_LABELS)) {
        if (raw.includes(code)) return msg;
    }
    if (raw.includes('HTTP 409') || raw.includes(' 409')) {
        return AGENT_ERROR_LABELS.stale_group_state;
    }
    if (/errno 2/i.test(raw) && /no such file or directory/i.test(raw)) {
        return AGENT_ERROR_LABELS.agent_cli_not_found;
    }
    if (/agent-review\/groups timed out/i.test(raw)) {
        return AGENT_ERROR_LABELS.agent_review_load_timeout;
    }
    return raw;
}

export function formatAgentActionError(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;
    const r = result as {
        ok?: boolean;
        error?: string;
        skip_reason?: string;
        error_message?: string;
    };
    if (r.ok !== false) return null;
    if (r.skip_reason) {
        return friendlyAgentError(r.error ?? 'unknown_error', r.skip_reason);
    }
    return (
        friendlyAgentReviewFailure(r.error, r.error_message)
        ?? friendlyAgentError(r.error ?? 'unknown_error', r.skip_reason)
    );
}

export function analyticsChipClassName(
    styles: { chip: string; chipWarn: string },
    warn?: boolean,
): string {
    return warn ? `${styles.chip} ${styles.chipWarn}` : styles.chip;
}

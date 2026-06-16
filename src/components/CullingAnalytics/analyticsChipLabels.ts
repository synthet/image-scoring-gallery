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
    operator_approved: 'Approved',
    operator_rejected: 'Rejected',
    rolled_back: 'Rolled back',
};

const AGENT_DECISION_LABELS: Record<string, string> = {
    remove: 'Remove',
    keep: 'Keep',
    uncertain: 'Uncertain',
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
};

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
    return raw;
}

export function formatAgentActionError(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;
    const r = result as { ok?: boolean; error?: string; skip_reason?: string };
    if (r.ok !== false) return null;
    return friendlyAgentError(r.error ?? 'unknown_error', r.skip_reason);
}

export function analyticsChipClassName(
    styles: { chip: string; chipWarn: string },
    warn?: boolean,
): string {
    return warn ? `${styles.chip} ${styles.chipWarn}` : styles.chip;
}

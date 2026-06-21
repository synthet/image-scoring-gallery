import { describe, expect, it } from 'vitest';
import {
    formatAnalyticsWarning,
    formatDecisionChip,
    friendlyAgentCandidateStatus,
    friendlyAgentDecision,
    friendlyAgentError,
    friendlyAgentGroupStatus,
    friendlyAgentReviewFailure,
    formatAgentActionError,
    agentRecommendationTone,
    agentRecommendationBadge,
    isAdvisoryRecommendation,
    formatAgentSummaryDigest,
} from './analyticsChipLabels';

describe('formatAnalyticsWarning', () => {
    it('maps known stack warning codes to friendly labels', () => {
        expect(formatAnalyticsWarning('mixed_color_labels')).toEqual({
            text: 'Mixed color labels',
            warn: true,
        });
        expect(formatAnalyticsWarning('visually_mixed_stack')).toEqual({
            text: 'Mixed subjects',
            warn: true,
        });
        expect(formatAnalyticsWarning('mixed_camera')).toEqual({
            text: 'Mixed cameras',
            warn: true,
        });
    });

    it('unwraps stack-prefixed library warnings', () => {
        expect(formatAnalyticsWarning('stack:42:mixed_lens')).toEqual({
            text: 'Mixed lenses',
            warn: true,
        });
    });

    it('formats count-suffixed library warnings', () => {
        expect(formatAnalyticsWarning('stacks_over_pick_cap_20:3')).toEqual({
            text: 'Stacks over 20-pick limit (3)',
            warn: true,
        });
    });

    it('humanizes unknown codes', () => {
        expect(formatAnalyticsWarning('some_new_flag')).toEqual({
            text: 'Some New Flag',
            warn: true,
        });
    });
});

describe('formatDecisionChip', () => {
    it('marks reject chips as warnings', () => {
        expect(formatDecisionChip('reject', 1)).toEqual({
            key: 'decision-reject',
            text: 'Reject 1',
            warn: true,
        });
    });
});

describe('friendlyAgent labels', () => {
    it('maps agent statuses', () => {
        expect(friendlyAgentGroupStatus('agent_pending')).toBe('Awaiting agent');
        expect(friendlyAgentCandidateStatus('agent_remove_candidate')).toEqual({
            text: 'Remove candidate',
            warn: true,
        });
    });

    it('labels picked-image quality advisories as non-warning info', () => {
        expect(friendlyAgentCandidateStatus('pick_quality_advisory')).toEqual({
            text: 'Quality advisory',
            warn: false,
        });
        expect(friendlyAgentDecision('advisory')).toBe('Advisory');
    });
});

describe('agentRecommendationTone / badge', () => {
    it('derives tone from candidate status first, then decision', () => {
        expect(agentRecommendationTone({ final_decision: 'remove', candidate_status: 'operator_approved' })).toBe('approved');
        expect(agentRecommendationTone({ final_decision: 'remove', candidate_status: 'operator_rejected' })).toBe('rejected');
        expect(agentRecommendationTone({ agent_decision: 'advisory', candidate_status: 'pick_quality_advisory' })).toBe('advisory');
        expect(agentRecommendationTone({ final_decision: 'remove', candidate_status: 'proposed' })).toBe('remove');
        expect(agentRecommendationTone({ final_decision: 'keep', candidate_status: 'none' })).toBe('neutral');
    });

    it('flags advisories by decision or candidate status', () => {
        expect(isAdvisoryRecommendation({ agent_decision: 'advisory' })).toBe(true);
        expect(isAdvisoryRecommendation({ candidate_status: 'pick_quality_advisory' })).toBe(true);
        expect(isAdvisoryRecommendation({ agent_decision: 'remove', candidate_status: 'proposed' })).toBe(false);
    });

    it('gives a scannable headline badge per tone', () => {
        expect(agentRecommendationBadge({ final_decision: 'remove', candidate_status: 'proposed' })).toBe('Remove');
        expect(agentRecommendationBadge({ agent_decision: 'advisory', candidate_status: 'pick_quality_advisory' })).toBe('Advisory');
        expect(agentRecommendationBadge({ final_decision: 'remove', candidate_status: 'operator_approved' })).toBe('Approved');
        expect(agentRecommendationBadge({ final_decision: 'remove', candidate_status: 'operator_rejected' })).toBe('Dismissed');
    });
});

describe('formatAgentSummaryDigest', () => {
    it('returns empty for blank input', () => {
        expect(formatAgentSummaryDigest(null)).toEqual({ digest: '', hasMore: false });
        expect(formatAgentSummaryDigest('   ')).toEqual({ digest: '', hasMore: false });
    });

    it('keeps a short single sentence intact without a "more" toggle', () => {
        expect(formatAgentSummaryDigest('Kept the sharper frame.')).toEqual({
            digest: 'Kept the sharper frame.',
            hasMore: false,
        });
    });

    it('truncates to the first sentence and flags more', () => {
        const result = formatAgentSummaryDigest(
            'Two near-duplicate frames detected. The sharper frame is kept and the soft one is proposed for removal.',
        );
        expect(result.digest).toBe('Two near-duplicate frames detected.');
        expect(result.hasMore).toBe(true);
    });

    it('strips embedded score tokens from the digest prose', () => {
        const result = formatAgentSummaryDigest('Frame A (0.93) is sharper than frame B (0.41).');
        expect(result.digest).not.toMatch(/0\.93|0\.41/);
    });
});

describe('friendlyAgentError', () => {
    it('prefers skip_reason over generic no_eligible_unit', () => {
        expect(friendlyAgentError('no_eligible_unit', 'group_too_large')).toMatch(
            /configured max size/i,
        );
    });

    it('maps errno 2 missing CLI to a friendly message', () => {
        expect(
            friendlyAgentError("[Errno 2] No such file or directory: 'gemini'"),
        ).toMatch(/agent CLI was not found/i);
    });

    it('maps auth tier failures to operator guidance', () => {
        expect(friendlyAgentReviewFailure('agent_cli_auth_tier', null)).toMatch(/Antigravity/i);
    });

    it('uses error_message from run action results', () => {
        expect(
            formatAgentActionError({
                ok: false,
                error: 'agent_cli_auth_tier',
                error_message: 'ignored when code is mapped',
            }),
        ).toMatch(/Antigravity/i);
    });
});

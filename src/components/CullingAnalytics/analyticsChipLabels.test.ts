import { describe, expect, it } from 'vitest';
import {
    formatAnalyticsWarning,
    formatDecisionChip,
    friendlyAgentCandidateStatus,
    friendlyAgentError,
    friendlyAgentGroupStatus,
    friendlyAgentReviewFailure,
    formatAgentActionError,
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

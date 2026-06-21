import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAgentCullReview } from './useAgentCullReview';

function setApi(api: Record<string, unknown>) {
    Object.defineProperty(window, 'electron', { configurable: true, value: { api } });
}

describe('useAgentCullReview', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'electron', { configurable: true, value: undefined });
    });

    it('loads the latest group, builds the per-image map, and exposes canRun', async () => {
        setApi({
            getAgentCullGroups: vi.fn().mockResolvedValue({ groups: [{ id: 9, stack_id: 1, status: 'proposed', dry_run: true }] }),
            getAgentCullGroup: vi.fn().mockResolvedValue({
                id: 9,
                stack_id: 1,
                status: 'proposed',
                dry_run: true,
                recommendations: [
                    { id: 1, review_group_id: 9, image_id: 100, agent_decision: 'remove', final_decision: 'remove', candidate_status: 'proposed' },
                ],
            }),
            runAgentCullReview: vi.fn(),
        });

        const { result } = renderHook(() => useAgentCullReview(1, null));
        await waitFor(() => expect(result.current.detail?.id).toBe(9));
        expect(result.current.recommendationsByImageId.get(100)?.id).toBe(1);
        expect(result.current.canRun).toBe(true);
    });

    it('does not fetch when disabled', async () => {
        const getAgentCullGroups = vi.fn().mockResolvedValue({ groups: [] });
        setApi({ getAgentCullGroups });
        renderHook(() => useAgentCullReview(1, null, { enabled: false }));
        await Promise.resolve();
        expect(getAgentCullGroups).not.toHaveBeenCalled();
    });

    it('surfaces a friendly stale-state message on a 409 and refreshes', async () => {
        const getAgentCullGroups = vi
            .fn()
            .mockResolvedValue({ groups: [{ id: 9, stack_id: 1, status: 'proposed', dry_run: false }] });
        const applyAgentCullCandidates = vi
            .fn()
            .mockResolvedValue({ ok: false, error: 'stale_group_state', group_id: 9 });
        setApi({
            getAgentCullGroups,
            getAgentCullGroup: vi.fn().mockResolvedValue({
                id: 9,
                stack_id: 1,
                status: 'proposed',
                dry_run: false,
                recommendations: [
                    { id: 5, review_group_id: 9, image_id: 100, agent_decision: 'remove', final_decision: 'remove', candidate_status: 'proposed' },
                ],
            }),
            applyAgentCullCandidates,
            runAgentCullReview: vi.fn(),
        });

        const { result } = renderHook(() => useAgentCullReview(1, null));
        await waitFor(() => expect(result.current.detail?.id).toBe(9));

        await act(async () => {
            result.current.applyCandidates();
        });

        await waitFor(() => expect(result.current.error).toMatch(/Re-run the dry-run review/i));
        expect(applyAgentCullCandidates).toHaveBeenCalledWith(9);
    });

    it('runs a live review with dryRun:false', async () => {
        const runAgentCullReview = vi.fn().mockResolvedValue({ id: 9, status: 'validated', dry_run: false });
        setApi({
            getAgentCullGroups: vi.fn().mockResolvedValue({ groups: [{ id: 9, stack_id: 1, status: 'proposed', dry_run: true }] }),
            getAgentCullGroup: vi.fn().mockResolvedValue({ id: 9, stack_id: 1, status: 'proposed', dry_run: true, recommendations: [] }),
            runAgentCullReview,
        });

        const { result } = renderHook(() => useAgentCullReview(2, 3));
        await waitFor(() => expect(result.current.detail?.id).toBe(9));

        await act(async () => {
            result.current.runReview(false);
        });

        await waitFor(() => {
            expect(runAgentCullReview).toHaveBeenCalledWith({ stackId: 2, subStackId: 3, dryRun: false });
        });
    });
});

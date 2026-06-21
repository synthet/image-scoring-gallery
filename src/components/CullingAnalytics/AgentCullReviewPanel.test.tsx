import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AgentCullReviewPanel } from './AgentCullReviewPanel';

describe('AgentCullReviewPanel', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: undefined,
        });
    });

    it('renders nothing when API bridge is unavailable', async () => {
        const { container } = render(<AgentCullReviewPanel stackId={1} />);
        await waitFor(() => {
            expect(container.firstChild).toBeNull();
        });
    });

    it('shows dry-run badge and recommendations without delete controls', async () => {
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({
                        groups: [{ id: 9, stack_id: 1, status: 'proposed', dry_run: true, summary: 'Test' }],
                    }),
                    getAgentCullGroup: vi.fn().mockResolvedValue({
                        id: 9,
                        stack_id: 1,
                        status: 'proposed',
                        dry_run: true,
                        summary: 'Test summary',
                        recommendations: [
                            {
                                id: 1,
                                review_group_id: 9,
                                image_id: 100,
                                agent_decision: 'remove',
                                final_decision: 'remove',
                                confidence: 0.9,
                                reason: 'Duplicate frame',
                                candidate_status: 'proposed',
                            },
                        ],
                    }),
                    approveAgentCullGroup: vi.fn().mockResolvedValue({ updated: 1 }),
                    rejectAgentCullGroup: vi.fn().mockResolvedValue({ updated: 1 }),
                    rollbackAgentCullRecommendation: vi.fn().mockResolvedValue({ ok: true }),
                    applyAgentCullCandidates: vi.fn().mockResolvedValue({ ok: true, updated: 1 }),
                    updateImagePickStatus: vi.fn().mockResolvedValue({}),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);
        expect(await screen.findByTestId('agent-cull-review-panel')).toBeTruthy();
        const dryRun = await screen.findByTestId('agent-cull-dry-run-badge');
        expect(dryRun.textContent).toContain('Dry run');
        expect(await screen.findByText(/Metadata-only/)).toBeTruthy();
        expect(screen.queryByTestId('agent-cull-apply-candidates')).toBeNull();
        expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /trash/i })).toBeNull();
    });

    it('runs a dry-run review via IPC when no groups exist yet (#135)', async () => {
        const runAgentCullReview = vi.fn().mockResolvedValue({ id: 11, status: 'proposed', dry_run: true });
        const getAgentCullGroups = vi
            .fn()
            // first load: no groups
            .mockResolvedValueOnce({ groups: [] })
            // after run + refresh: one dry-run group
            .mockResolvedValue({ groups: [{ id: 11, stack_id: 1, status: 'proposed', dry_run: true }] });
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups,
                    getAgentCullGroup: vi.fn().mockResolvedValue({
                        id: 11,
                        stack_id: 1,
                        status: 'proposed',
                        dry_run: true,
                        recommendations: [],
                    }),
                    runAgentCullReview,
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} subStackId={3} />);
        const runBtn = await screen.findByTestId('agent-cull-run-review');
        fireEvent.click(runBtn);
        await waitFor(() => {
            expect(runAgentCullReview).toHaveBeenCalledWith({ stackId: 1, subStackId: 3, dryRun: true });
        });
        // dry-run badge appears after the refresh
        expect(await screen.findByTestId('agent-cull-dry-run-badge')).toBeTruthy();
    });

    it('shows progress indicator while dry-run review is in flight', async () => {
        let resolveReview: (value: unknown) => void = () => {};
        const runAgentCullReview = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveReview = resolve;
                }),
        );
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({ groups: [] }),
                    getAgentCullGroup: vi.fn(),
                    runAgentCullReview,
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);
        fireEvent.click(await screen.findByTestId('agent-cull-run-review'));
        const progress = await screen.findByTestId('agent-cull-review-progress');
        expect(progress.textContent).toMatch(/Agent review in progress/i);
        expect(progress.textContent).toMatch(/30–90 seconds/i);
        resolveReview({ ok: true, group_id: 12 });
        await waitFor(() => {
            expect(screen.queryByTestId('agent-cull-review-progress')).toBeNull();
        });
    });

    it('surfaces a 409 stale_group_state error with a re-run prompt (#136)', async () => {
        const apply = vi
            .fn()
            .mockRejectedValue(
                new Error('API POST /api/culling/agent-review/groups/9/apply-candidates returned HTTP 409: {"error":"stale_group_state"}'),
            );
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({
                        groups: [{ id: 9, stack_id: 1, status: 'proposed', dry_run: false }],
                    }),
                    getAgentCullGroup: vi.fn().mockResolvedValue({
                        id: 9,
                        stack_id: 1,
                        status: 'proposed',
                        dry_run: false,
                        recommendations: [
                            {
                                id: 5,
                                review_group_id: 9,
                                image_id: 100,
                                agent_decision: 'remove',
                                final_decision: 'remove',
                                candidate_status: 'proposed',
                            },
                        ],
                    }),
                    runAgentCullReview: vi.fn(),
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: apply,
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);
        const applyBtn = await screen.findByTestId('agent-cull-apply-candidates');
        fireEvent.click(applyBtn);
        const err = await screen.findByTestId('agent-cull-action-error');
        expect(err.textContent).toMatch(/Re-run the dry-run review/i);
        expect(err.textContent).not.toContain('HTTP 409');
    });

    it('surfaces a dry_run_group error returned as ok:false (#136)', async () => {
        const apply = vi.fn().mockResolvedValue({ ok: false, error: 'dry_run_group' });
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({
                        groups: [{ id: 9, stack_id: 1, status: 'proposed', dry_run: false }],
                    }),
                    getAgentCullGroup: vi.fn().mockResolvedValue({
                        id: 9,
                        stack_id: 1,
                        status: 'proposed',
                        dry_run: false,
                        recommendations: [
                            {
                                id: 5,
                                review_group_id: 9,
                                image_id: 100,
                                agent_decision: 'remove',
                                final_decision: 'remove',
                                candidate_status: 'proposed',
                            },
                        ],
                    }),
                    runAgentCullReview: vi.fn(),
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: apply,
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);
        const applyBtn = await screen.findByTestId('agent-cull-apply-candidates');
        fireEvent.click(applyBtn);
        const err = await screen.findByTestId('agent-cull-action-error');
        expect(err.textContent).toMatch(/dry-run review/i);
    });

    it('surfaces skip_reason for no_eligible_unit from run action', async () => {
        const runAgentCullReview = vi.fn().mockResolvedValue({
            ok: false,
            error: 'no_eligible_unit',
            skip_reason: 'group_too_large',
        });
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({ groups: [] }),
                    runAgentCullReview,
                    getAgentCullGroup: vi.fn(),
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} subStackId={3} />);
        const runBtn = await screen.findByTestId('agent-cull-run-review');
        fireEvent.click(runBtn);
        const err = await screen.findByTestId('agent-cull-error');
        expect(err.textContent).toMatch(/configured max size/i);
        expect(err.textContent).not.toContain('no_eligible_unit');
    });

    it('shows friendly failure message for a failed review group', async () => {
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({
                        groups: [{
                            id: 21,
                            stack_id: 28794,
                            status: 'failed',
                            dry_run: true,
                            error_code: 'agent_cli_auth_tier',
                            error_message: 'IneligibleTierError',
                        }],
                    }),
                    getAgentCullGroup: vi.fn().mockResolvedValue({
                        id: 21,
                        stack_id: 28794,
                        status: 'failed',
                        dry_run: true,
                        error_code: 'agent_cli_auth_tier',
                        error_message: 'IneligibleTierError',
                        recommendations: [],
                    }),
                    runAgentCullReview: vi.fn(),
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={28794} />);
        const err = await screen.findByTestId('agent-cull-action-error');
        expect(err.textContent).toMatch(/Antigravity/i);
        expect(err.textContent).not.toContain('exit_code_1');
    });

    it('refreshes after a failed run that persisted a review group', async () => {
        const runAgentCullReview = vi.fn().mockResolvedValue({
            ok: false,
            group_id: 21,
            error: 'agent_cli_auth_tier',
            error_message: 'IneligibleTierError',
        });
        const getAgentCullGroups = vi
            .fn()
            .mockResolvedValueOnce({ groups: [] })
            .mockResolvedValue({
                groups: [{
                    id: 21,
                    stack_id: 1,
                    status: 'failed',
                    dry_run: true,
                    error_code: 'agent_cli_auth_tier',
                }],
            });
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups,
                    getAgentCullGroup: vi.fn().mockResolvedValue({
                        id: 21,
                        stack_id: 1,
                        status: 'failed',
                        dry_run: true,
                        error_code: 'agent_cli_auth_tier',
                        recommendations: [],
                    }),
                    runAgentCullReview,
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);
        fireEvent.click(await screen.findByTestId('agent-cull-run-review'));
        await waitFor(() => {
            expect(getAgentCullGroups).toHaveBeenCalledTimes(2);
        });
        const err = await screen.findByTestId('agent-cull-action-error');
        expect(err.textContent).toMatch(/Antigravity/i);
    });

    it('shows action error after failed run even when a group_id is returned', async () => {
        const runAgentCullReview = vi.fn().mockResolvedValue({
            ok: false,
            group_id: 21,
            error: 'malformed_json',
        });
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({ groups: [] }),
                    getAgentCullGroup: vi.fn(),
                    runAgentCullReview,
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);
        fireEvent.click(await screen.findByTestId('agent-cull-run-review'));
        const err = await screen.findByTestId('agent-cull-error');
        expect(err.textContent).toMatch(/parseable JSON/i);
    });

    it('calls IPC approve bridge without delete', async () => {
        const approve = vi.fn().mockResolvedValue({ updated: 1 });
        const getAgentCullGroup = vi.fn().mockResolvedValue({
            id: 9,
            stack_id: 1,
            status: 'proposed',
            dry_run: true,
            recommendations: [
                {
                    id: 42,
                    review_group_id: 9,
                    image_id: 100,
                    agent_decision: 'remove',
                    final_decision: 'remove',
                    candidate_status: 'proposed',
                },
            ],
        });
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({
                        groups: [{ id: 9, stack_id: 1, status: 'proposed', dry_run: true }],
                    }),
                    getAgentCullGroup,
                    approveAgentCullGroup: approve,
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);
        const btn = await screen.findByTestId('agent-cull-approve-42');
        fireEvent.click(btn);
        await waitFor(() => {
            expect(approve).toHaveBeenCalledWith(9, { recommendationIds: [42] });
        });
    });

    it('keeps picked-image quality advisories display-only', async () => {
        Object.defineProperty(window, 'electron', {
            configurable: true,
            value: {
                api: {
                    getAgentCullGroups: vi.fn().mockResolvedValue({
                        groups: [{ id: 10, stack_id: 1, status: 'proposed', dry_run: true }],
                    }),
                    getAgentCullGroup: vi.fn().mockResolvedValue({
                        id: 10,
                        stack_id: 1,
                        status: 'proposed',
                        dry_run: true,
                        recommendations: [
                            {
                                id: 43,
                                review_group_id: 10,
                                image_id: 101,
                                agent_decision: 'advisory',
                                final_decision: 'keep',
                                candidate_status: 'pick_quality_advisory',
                            },
                            {
                                id: 44,
                                review_group_id: 10,
                                image_id: 102,
                                agent_decision: 'advisory',
                                final_decision: 'keep',
                                candidate_status: 'proposed',
                            },
                        ],
                    }),
                    approveAgentCullGroup: vi.fn(),
                    rejectAgentCullGroup: vi.fn(),
                    rollbackAgentCullRecommendation: vi.fn(),
                    applyAgentCullCandidates: vi.fn(),
                    updateImagePickStatus: vi.fn(),
                },
            },
        });

        render(<AgentCullReviewPanel stackId={1} />);

        expect(await screen.findByText('Quality advisory')).toBeTruthy();
        expect(screen.queryByTestId('agent-cull-approve-43')).toBeNull();
        expect(screen.queryByTestId('agent-cull-reject-43')).toBeNull();
        expect(screen.queryByTestId('agent-cull-neutral-43')).toBeNull();
        expect(screen.queryByTestId('agent-cull-rollback-43')).toBeNull();
        expect(screen.queryByTestId('agent-cull-reject-44')).toBeNull();
        expect(screen.queryByTestId('agent-cull-neutral-44')).toBeNull();
        expect(screen.queryByTestId('agent-cull-rollback-44')).toBeNull();
    });
});

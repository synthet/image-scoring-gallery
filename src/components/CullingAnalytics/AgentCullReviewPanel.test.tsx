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
});

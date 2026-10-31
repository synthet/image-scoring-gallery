import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StackAnalyticsBanner } from './StackAnalyticsBanner';

describe('StackAnalyticsBanner', () => {
    beforeEach(() => {
        vi.stubGlobal('electron', {
            api: {
                getStackAnalytics: vi.fn().mockResolvedValue({
                    scope: 'stack',
                    stack_id: 28679,
                    decisions: { pick: 3, reject: 1, neutral: 0 },
                    exposure: { likely_burst: true },
                    embeddings: { avg_cosine_similarity: 0.94 },
                    scores: { score_gap_top_two: 0 },
                }),
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('renders auto-cull decision chips and burst analytics', async () => {
        render(<StackAnalyticsBanner stackId={28679} />);

        await waitFor(() => {
            expect(screen.getByText('Pick 3')).toBeTruthy();
        });
        expect(screen.getByText('Reject 1')).toBeTruthy();
        expect(screen.getByText('Likely burst')).toBeTruthy();
    });

    it('renders friendly warning labels with shared chip styling', async () => {
        vi.mocked(window.electron.api.getStackAnalytics).mockResolvedValue({
            scope: 'stack',
            stack_id: 28680,
            warnings: ['mixed_color_labels', 'visually_mixed_stack'],
            exposure: { warnings: ['mixed_camera', 'mixed_lens'] },
        });

        render(<StackAnalyticsBanner stackId={28680} />);

        await waitFor(() => {
            expect(screen.getByText('Mixed color labels')).toBeTruthy();
        });
        expect(screen.getByText('Mixed subjects')).toBeTruthy();
        expect(screen.getByText('Mixed cameras')).toBeTruthy();
        expect(screen.getByText('Mixed lenses')).toBeTruthy();

        const warnChip = screen.getByText('Mixed color labels');
        expect(warnChip.className).toContain('chip');
        expect(warnChip.className).toContain('chipWarn');
    });
});

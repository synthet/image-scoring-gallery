import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StackAnalyticsBanner } from './StackAnalyticsBanner';

describe('StackAnalyticsBanner', () => {
    beforeEach(() => {
        (window as Window & { electron?: { api: { getStackAnalytics: ReturnType<typeof vi.fn> } } }).electron = {
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
        };
    });

    afterEach(() => {
        delete (window as Window & { electron?: unknown }).electron;
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
});

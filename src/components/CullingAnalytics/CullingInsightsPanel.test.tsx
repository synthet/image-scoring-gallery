import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CullingInsightsPanel } from './CullingInsightsPanel';

describe('CullingInsightsPanel', () => {
    beforeEach(() => {
        window.electron = {
            api: {
                getCullingAnalytics: vi.fn().mockResolvedValue({
                    scope: 'library',
                    stack_size: { total_stacks: 5, total_stacked_images: 20, singleton_stacks: 2, singleton_pct: 40 },
                    flags: { pick_count: 3, reject_count: 1, stacks_needing_review: 1 },
                    embeddings: { coverage_pct: 80 },
                    composite: { review_priority_score: 0.42 },
                }),
            },
        } as unknown as typeof window.electron;
    });

    it('renders collapsed header', () => {
        render(<CullingInsightsPanel stacksMode folderPath="/photos" />);
        expect(screen.getByText('Culling insights')).toBeTruthy();
    });

    it('loads stats when expanded', async () => {
        render(<CullingInsightsPanel stacksMode folderPath="/photos" collapsed={false} />);
        expect(await screen.findByText(/Stacks/)).toBeTruthy();
        expect(screen.getByText(/Needs review/)).toBeTruthy();
    });
});

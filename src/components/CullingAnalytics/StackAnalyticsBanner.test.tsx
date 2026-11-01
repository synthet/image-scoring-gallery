import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { StackAnalyticsBanner } from './StackAnalyticsBanner';
import { useBackendStatusStore } from '../../store/useBackendStatusStore';

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
        useBackendStatusStore.setState({ state: { status: 'unknown', url: null, lastCheckedAt: null, error: null }, reconnectCount: 0 });
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

    it('skips the backend call while disconnected and loads after reconnect', async () => {
        const offline = { status: 'disconnected' as const, url: 'http://127.0.0.1:7860', lastCheckedAt: null, error: 'fetch failed' };
        useBackendStatusStore.getState().setState(offline);

        render(<StackAnalyticsBanner stackId={28679} />);
        expect(window.electron.api.getStackAnalytics).not.toHaveBeenCalled();
        expect(screen.queryByText('Pick 3')).toBeNull();

        act(() => { useBackendStatusStore.getState().setState({ ...offline, status: 'connected', error: null }); });
        expect(useBackendStatusStore.getState().reconnectCount).toBe(1);
        await waitFor(() => {
            expect(screen.getByText('Pick 3')).toBeTruthy();
        });
    });
});

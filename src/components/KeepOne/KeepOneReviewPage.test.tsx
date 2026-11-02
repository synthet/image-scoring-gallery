import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeepOneReviewPage } from './KeepOneReviewPage';
import type { KeepOneFrame, KeepOneReviewResult } from '../../../electron/keepOneReview';

const frame = (imageId: number, extra: Partial<KeepOneFrame> = {}): KeepOneFrame => ({
    imageId, file: `DSC_${imageId}.NEF`, captureTime: null, iso: 800, afState: 'unavailable',
    scores: { focus: 0.45, noise: 0.6, eye: 0.5, exposure: 0.6 },
    flagsAtFreeze: { rating: 3, label: 'Green', pick_status: -1 },
    live: { rating: 3, label: 'Green', pick_status: -1 },
    changedSinceFreeze: false, thumbnailPath: `D:/t/${imageId}.jpg`, filePath: `D:/p/${imageId}.NEF`, ...extra,
});

const result: KeepOneReviewResult = {
    status: 'ok',
    manifestSha256: 'sha',
    totals: { shoots: 2, clusters: 2, removed: 3, frames: 6000, bytes: 99_000_000 },
    missingIds: [9],
    shoots: [
        {
            shoot: 'a', folder: 'D:\\Photos\\2026-01-19', camera: 'Z8', run: 'r', frames: 3423, bytes: 66_000_000,
            clusters: [{
                shoot: 'a', cluster: 0, keeper: frame(3),
                removed: [
                    { ...frame(1), basis: 'head_sharpness', tie: false, jev: null },
                    { ...frame(9, { live: null }), basis: 'tie', tie: true, jev: { choice: 'k3', confidence: 0.92, model: 'jev-1.14.0' } },
                ],
            }],
        },
        {
            shoot: 'b', folder: 'D:\\Photos\\2026-02-01', camera: 'Z8', run: 'r', frames: 2577, bytes: 33_000_000,
            clusters: [{
                shoot: 'b', cluster: 4, keeper: frame(7, { changedSinceFreeze: true }),
                removed: [{ ...frame(6), basis: 'refcull_focus', tie: false, jev: null }],
            }],
        },
    ],
};

function setBridge(loadKeepOneReview: () => Promise<KeepOneReviewResult>) {
    Object.defineProperty(window, 'electron', { configurable: true, value: { loadKeepOneReview } });
}

describe('KeepOneReviewPage', () => {
    afterEach(() => {
        Object.defineProperty(window, 'electron', { configurable: true, value: undefined });
    });

    it('opens an export and shows clusters, keepers, removals and Jev ties', async () => {
        setBridge(vi.fn().mockResolvedValue(result));
        const onOpenImage = vi.fn();
        render(<KeepOneReviewPage onOpenImage={onOpenImage} />);
        fireEvent.click(screen.getByRole('button', { name: /open keep-one export/i }));

        expect(await screen.findAllByTestId('keepone-cluster')).toHaveLength(2);
        expect(screen.getAllByText('Keeper')).toHaveLength(2);
        expect(screen.getAllByText('Proposed soft-cull')).toHaveLength(3);
        expect(screen.getByText('Jev tie 0.92')).toBeTruthy();
        // once as the frame's tag, once as the summary count label
        expect(screen.getAllByText('Not in catalog')).toHaveLength(2);

        fireEvent.click(screen.getByTestId('keepone-frame-1'));
        expect(onOpenImage).toHaveBeenCalledWith(1);
        // a frame that left the catalog cannot be opened
        expect((screen.getByTestId('keepone-frame-9') as HTMLButtonElement).disabled).toBe(true);
    });

    it('filters by shoot, basis and changed-since-run', async () => {
        setBridge(vi.fn().mockResolvedValue(result));
        render(<KeepOneReviewPage onOpenImage={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /open keep-one export/i }));
        await screen.findAllByTestId('keepone-cluster');

        fireEvent.change(screen.getByLabelText('Shoot'), { target: { value: 'b' } });
        expect(screen.getAllByTestId('keepone-cluster')).toHaveLength(1);
        fireEvent.change(screen.getByLabelText('Shoot'), { target: { value: 'all' } });

        fireEvent.change(screen.getByLabelText('Removal basis'), { target: { value: 'tie' } });
        expect(screen.getAllByTestId('keepone-cluster')).toHaveLength(1);
        fireEvent.change(screen.getByLabelText('Removal basis'), { target: { value: 'all' } });

        fireEvent.click(screen.getByLabelText('Changed since run'));
        const shown = screen.getAllByTestId('keepone-cluster');
        expect(shown).toHaveLength(1);
        expect(shown[0].textContent).toContain('2026-02-01');
    });

    it('stays quiet on a cancelled pick and explains other failures', async () => {
        const load = vi.fn()
            .mockResolvedValueOnce({ status: 'fallback', reason: 'cancelled', detail: 'no export chosen' })
            .mockResolvedValueOnce({ status: 'fallback', reason: 'invalid_manifest', detail: 'unsupported schema x' });
        setBridge(load);
        render(<KeepOneReviewPage onOpenImage={vi.fn()} />);
        const open = screen.getByRole('button', { name: /open keep-one export/i });

        fireEvent.click(open);
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alert')).toBeNull();

        fireEvent.click(open);
        expect((await screen.findByRole('alert')).textContent).toContain('unsupported schema x');
    });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRepresentativeView } from './useRepresentativeView';

type Row = { id: number; file_name: string; image_count?: number };

const rows: Row[] = [1, 2, 3, 4].map((id) => ({ id, file_name: `${id}.NEF` }));
const okLoad = {
    preview: {
        status: 'ok',
        manifestSha256: 'sha',
        shootKey: 's',
        frameCount: 4,
        cards: [{ representativeId: 2, memberIds: [2, 1, 3] }, { representativeId: 4, memberIds: [4] }],
        changedSinceFreeze: [],
    },
    images: rows,
};

describe('useRepresentativeView', () => {
    let loadRepresentativePreview: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        loadRepresentativePreview = vi.fn().mockResolvedValue(okLoad);
        // Only the read-only loader exists: any rating, flag or file call would throw.
        (window as unknown as { electron?: unknown }).electron = { loadRepresentativePreview };
    });

    afterEach(() => {
        (window as unknown as { electron?: unknown }).electron = undefined;
    });

    it('shows one card per group, opens a group, and returns to the card on Back', async () => {
        const { result } = renderHook(() => useRepresentativeView<Row>(7, false));
        await act(() => result.current.setRepresentativeMode(true));
        expect(loadRepresentativePreview).toHaveBeenCalledWith(7);
        expect(result.current.enabled).toBe(true);
        expect(result.current.displayImages).toEqual([
            { id: 2, file_name: '2.NEF', image_count: 3 },
            { id: 4, file_name: '4.NEF', image_count: 1 },
        ]);
        expect(result.current.hiddenCount).toBe(2);

        act(() => result.current.openCard({ id: 2 }));
        expect(result.current.displayImages.map((r) => r.id)).toEqual([2, 1, 3]);
        act(() => result.current.closeCard());
        expect(result.current.activeCard).toBeNull();
        expect(result.current.returnToId).toBe(2);
        expect(result.current.displayImages.map((r) => r.id)).toEqual([2, 4]);

        act(() => result.current.openCard({ id: 4 }));  // a single frame has no group to open
        expect(result.current.activeCard).toBeNull();
    });

    it('expanding every card reproduces the folder exactly once', async () => {
        const { result } = renderHook(() => useRepresentativeView<Row>(7, false));
        await act(() => result.current.setRepresentativeMode(true));
        const seen: number[] = [];
        for (const card of [...result.current.displayImages]) {
            act(() => result.current.openCard(card));
            seen.push(...(result.current.activeCard ? result.current.displayImages.map((r) => r.id) : [card.id]));
            act(() => result.current.closeCard());
        }
        expect(seen.sort()).toEqual([1, 2, 3, 4]);
    });

    it('stays on the ordinary grid for a fallback, active filters or a folder change', async () => {
        loadRepresentativePreview.mockResolvedValueOnce({
            preview: { status: 'fallback', reason: 'stale_membership', detail: 'folder and manifest differ' },
            images: [],
        });
        const { result, rerender } = renderHook(({ folder, filters }) => useRepresentativeView<Row>(folder, filters),
            { initialProps: { folder: 7 as number | undefined, filters: false } });
        await act(() => result.current.setRepresentativeMode(true));
        expect(result.current.enabled).toBe(false);
        expect(result.current.preview).toMatchObject({ reason: 'stale_membership' });

        await act(() => result.current.setRepresentativeMode(true));
        expect(result.current.enabled).toBe(true);
        rerender({ folder: 7, filters: true });
        expect(result.current.enabled).toBe(false);
        expect(result.current.preview).toMatchObject({ reason: 'filters_active' });

        rerender({ folder: 7, filters: false });
        await act(() => result.current.setRepresentativeMode(true));
        rerender({ folder: 8, filters: false });
        expect(result.current.enabled).toBe(false);
        expect(result.current.preview).toBeNull();
    });

    it('drops the view when an image leaves the folder', async () => {
        const { result } = renderHook(() => useRepresentativeView<Row>(7, false));
        await act(() => result.current.setRepresentativeMode(true));
        act(() => result.current.invalidate());
        expect(result.current.enabled).toBe(false);
        expect(result.current.preview).toMatchObject({ reason: 'folder_changed' });
        expect(loadRepresentativePreview).toHaveBeenCalledTimes(1);
    });
});

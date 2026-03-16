/**
 * Race-safety tests for useImages / usePaginatedData (EIS-101).
 *
 * Covers:
 *   1. Stale-response guard — a slow in-flight request that completes after a
 *      newer one must not overwrite the fresher state.
 *   2. Concurrent-request guard — calling loadMore while a request is already
 *      in flight must not start a second fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useImages } from './useDatabase';

type MockElectron = {
    getImages: ReturnType<typeof vi.fn>;
    getImageCount: ReturnType<typeof vi.fn>;
};

function makeImage(id: number) {
    return {
        id,
        file_path: `/img/${id}.jpg`,
        file_name: `${id}.jpg`,
        score_general: 0,
        score_technical: 0,
        score_aesthetic: 0,
        score_spaq: 0,
        score_ava: 0,
        score_liqe: 0,
        rating: 0,
        label: null,
    };
}

describe('useImages race safety (EIS-101)', () => {
    let electron: MockElectron;

    beforeEach(() => {
        electron = {
            getImages: vi.fn(),
            getImageCount: vi.fn().mockResolvedValue(100),
        };
        (window as Window & { electron?: MockElectron }).electron = electron;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (window as Window & { electron?: MockElectron }).electron;
    });

    it('discards stale response when a newer request completes first', async () => {
        // First call (stale): resolves after a manually controlled delay.
        // Second call (fresh): resolves immediately.
        let resolveStale!: (v: ReturnType<typeof makeImage>[]) => void;
        const stalePromise = new Promise<ReturnType<typeof makeImage>[]>(res => {
            resolveStale = res;
        });

        const staleImages = [makeImage(1), makeImage(2)];
        const freshImages = [makeImage(10), makeImage(11)];

        electron.getImages
            .mockImplementationOnce(() => stalePromise)          // 1st call: stale
            .mockResolvedValueOnce(freshImages);                  // 2nd call: fresh (after refresh)

        const { result } = renderHook(() => useImages(50, undefined, undefined));

        // Wait for the first (stale) request to be in flight.
        await waitFor(() => {
            expect(electron.getImages).toHaveBeenCalledTimes(1);
        });

        // Trigger a full refresh (bumps queryVersion) and let the fresh request
        // settle before the stale one.
        act(() => {
            result.current.refresh();
        });

        // Fresh request resolves.
        await waitFor(() => {
            expect(electron.getImages).toHaveBeenCalledTimes(2);
        });

        // Now resolve the stale request.
        await act(async () => {
            resolveStale(staleImages);
        });

        // State must reflect only the fresh data.
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const ids = result.current.images.map(img => img.id);
        expect(ids).toEqual(freshImages.map(i => i.id));
        expect(ids).not.toContain(staleImages[0].id);
    });

    it('does not fire a second fetch while one is already in flight', async () => {
        let resolveFirst!: (v: ReturnType<typeof makeImage>[]) => void;
        const firstPromise = new Promise<ReturnType<typeof makeImage>[]>(res => {
            resolveFirst = res;
        });

        electron.getImages.mockImplementationOnce(() => firstPromise);

        const { result } = renderHook(() => useImages(50, undefined, undefined));

        // Wait until the first request is in flight (loading = true).
        await waitFor(() => {
            expect(result.current.loading).toBe(true);
        });

        // Attempt to call loadMore while loading — should be a no-op.
        await act(async () => {
            await result.current.loadMore();
        });

        // Only one fetch should have been made.
        expect(electron.getImages).toHaveBeenCalledTimes(1);

        // Resolve and confirm normal completion.
        await act(async () => {
            resolveFirst([makeImage(1)]);
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.images).toHaveLength(1);
    });

    it('resets and re-fetches when folderId changes, discarding in-flight results from old folder', async () => {
        let resolveOldFolder!: (v: ReturnType<typeof makeImage>[]) => void;
        const oldFolderPromise = new Promise<ReturnType<typeof makeImage>[]>(res => {
            resolveOldFolder = res;
        });

        const newFolderImages = [makeImage(99)];

        electron.getImages
            .mockImplementationOnce(() => oldFolderPromise)      // folder 1: slow
            .mockResolvedValueOnce(newFolderImages);              // folder 2: fast

        const { result, rerender } = renderHook(
            ({ folderId }: { folderId: number | undefined }) => useImages(50, folderId, undefined),
            { initialProps: { folderId: 1 as number | undefined } }
        );

        // Wait for folder-1 request to be in flight.
        await waitFor(() => {
            expect(electron.getImages).toHaveBeenCalledTimes(1);
        });

        // Switch to folder 2 — triggers reset + new fetch.
        rerender({ folderId: 2 });

        // Wait for folder-2 request.
        await waitFor(() => {
            expect(electron.getImages).toHaveBeenCalledTimes(2);
        });

        // Now resolve the stale folder-1 request.
        await act(async () => {
            resolveOldFolder([makeImage(1), makeImage(2)]);
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Only folder-2 images should be present.
        expect(result.current.images.map(i => i.id)).toEqual(newFolderImages.map(i => i.id));
    });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatSimilarImagesError, useSimilarImages } from './useDatabase';

const STORAGE_KEY = 'similar-search-timing-v1';

type ElectronSimilarApi = {
    searchSimilarImages: ReturnType<typeof vi.fn>;
};

describe('formatSimilarImagesError', () => {
    it('appends embedding backfill hint for no-embeddings errors', () => {
        const msg = formatSimilarImagesError('No embeddings available for similarity search');
        expect(msg).toContain('Similarity Clustering');
        expect(msg).toContain('run_populate_embeddings');
    });

    it('explains folder mode stub', () => {
        const msg = formatSimilarImagesError('folder mode');
        expect(msg).toContain('Electron');
    });
});

describe('useSimilarImages', () => {
    let electronApi: ElectronSimilarApi;

    beforeEach(() => {
        localStorage.removeItem(STORAGE_KEY);
        electronApi = {
            searchSimilarImages: vi.fn().mockResolvedValue({
                query_image_id: 42,
                results: [{ image_id: 2, file_path: '/a.jpg', similarity: 0.9 }],
                count: 1,
            }),
        };
        (window as unknown as { electron: ElectronSimilarApi }).electron = electronApi;
    });

    afterEach(() => {
        localStorage.removeItem(STORAGE_KEY);
        (window as unknown as { electron?: ElectronSimilarApi }).electron = undefined;
        vi.restoreAllMocks();
    });

    it('omits folder scope when folderId and folderPath are not set', async () => {
        const { result } = renderHook(() => useSimilarImages(42, { limit: 10 }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(electronApi.searchSimilarImages).toHaveBeenCalledWith({
            imageId: 42,
            limit: 10,
            minSimilarity: 0.8,
        });
        expect(result.current.images).toHaveLength(1);
    });

    it('passes folder scope when folderId and folderPath are set', async () => {
        const { result } = renderHook(() =>
            useSimilarImages(42, {
                folderId: 5,
                folderPath: '/photos/trip',
            }),
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(electronApi.searchSimilarImages).toHaveBeenCalledWith({
            imageId: 42,
            limit: 20,
            minSimilarity: 0.8,
            folderId: 5,
            folderPath: '/photos/trip',
        });
    });

    it('surfaces res.error from the bridge response', async () => {
        electronApi.searchSimilarImages.mockResolvedValue({
            query_image_id: 42,
            results: [],
            count: 0,
            error: 'folder mode',
        });

        const { result } = renderHook(() => useSimilarImages(42));

        await waitFor(() => {
            expect(result.current.error).toContain('Electron');
        });
        expect(result.current.images).toHaveLength(0);
    });

    it('records duration after a successful search', async () => {
        const nowSpy = vi.spyOn(performance, 'now');
        let tick = 1000;
        nowSpy.mockImplementation(() => {
            const t = tick;
            tick += 8;
            return t;
        });

        const { result } = renderHook(() => useSimilarImages(42));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        nowSpy.mockRestore();

        expect(result.current.lastDurationMs).not.toBeNull();
        expect(result.current.lastDurationMs).toBeGreaterThan(0);
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { library?: number[] };
        expect(stored.library?.length).toBeGreaterThan(0);
    });

    it('cancel stops loading and ignores late responses', async () => {
        let resolveSearch!: (value: unknown) => void;
        electronApi.searchSimilarImages.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveSearch = resolve;
                }),
        );

        const { result } = renderHook(() => useSimilarImages(42));

        await waitFor(() => {
            expect(result.current.loading).toBe(true);
        });

        act(() => {
            result.current.cancel();
        });
        expect(result.current.loading).toBe(false);

        resolveSearch({
            query_image_id: 42,
            results: [{ image_id: 99, file_path: '/late.jpg', similarity: 0.5 }],
            count: 1,
        });

        await waitFor(() => {
            expect(electronApi.searchSimilarImages).toHaveBeenCalled();
        });
        expect(result.current.images).toHaveLength(0);
    });
});

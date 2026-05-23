import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimilarSearchDrawer } from './SimilarSearchDrawer';

type ElectronSimilarApi = {
    getFolders: ReturnType<typeof vi.fn>;
    searchSimilarImages: ReturnType<typeof vi.fn>;
};

describe('SimilarSearchDrawer', () => {
    let electronApi: ElectronSimilarApi;

    beforeEach(() => {
        electronApi = {
            getFolders: vi.fn().mockResolvedValue([{ id: 5, path: '/photos/trip' }]),
            searchSimilarImages: vi.fn().mockResolvedValue({
                query_image_id: 1,
                results: [],
                count: 0,
            }),
        };
        (window as unknown as { electron: ElectronSimilarApi }).electron = electronApi;
    });

    afterEach(() => {
        (window as unknown as { electron?: ElectronSimilarApi }).electron = undefined;
        vi.restoreAllMocks();
    });

    it('searches library-wide by default when a folder id is provided', async () => {
        render(
            <SimilarSearchDrawer
                open
                onClose={vi.fn()}
                queryImageId={1}
                currentFolderId={5}
                onSelectImage={vi.fn()}
                onJumpToImageFolder={vi.fn()}
            />,
        );

        expect(screen.getByText('Searching entire library')).not.toBeNull();

        await waitFor(() => {
            expect(electronApi.searchSimilarImages).toHaveBeenCalled();
        });
        const firstCall = electronApi.searchSimilarImages.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(firstCall.folderId).toBeUndefined();
        expect(firstCall.folderPath).toBeUndefined();
    });

    it('passes folder scope when limit to current folder is enabled', async () => {
        render(
            <SimilarSearchDrawer
                open
                onClose={vi.fn()}
                queryImageId={1}
                currentFolderId={5}
                onSelectImage={vi.fn()}
                onJumpToImageFolder={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('checkbox', { name: /limit to current folder/i }));

        await waitFor(() => {
            const scopedCall = electronApi.searchSimilarImages.mock.calls.find((call) => {
                const opts = call[0] as Record<string, unknown>;
                return opts.folderId === 5;
            });
            expect(scopedCall).toBeDefined();
        });

        expect(await screen.findByText(/Restricted to folder/i)).not.toBeNull();
    });

    it('shows loading overlay with cancel while search is in flight', async () => {
        let resolveSearch!: (value: unknown) => void;
        electronApi.searchSimilarImages.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveSearch = resolve;
                }),
        );

        render(
            <SimilarSearchDrawer
                open
                onClose={vi.fn()}
                queryImageId={1}
                onSelectImage={vi.fn()}
                onJumpToImageFolder={vi.fn()}
            />,
        );

        expect(await screen.findByRole('status')).not.toBeNull();
        expect(screen.getByLabelText(/cancel similar image search/i)).not.toBeNull();
        expect(screen.getByText(/Searching for similar images/i)).not.toBeNull();

        resolveSearch({ query_image_id: 1, results: [], count: 0 });
        await waitFor(() => {
            expect(screen.queryByRole('status')).toBeNull();
        });
    });
});

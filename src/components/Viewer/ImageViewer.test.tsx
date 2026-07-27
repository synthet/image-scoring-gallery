import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useKeyboardLayer', () => ({
    useKeyboardLayer: vi.fn(),
}));

vi.mock('../../utils/exportImageBake', () => ({
    bakeExifOrientationToBlob: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../utils/nefViewer', () => ({
    nefViewer: {
        extractWithFallback: vi.fn(),
    },
}));

vi.mock('../../hooks/useDatabase', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../hooks/useDatabase')>();
    return {
        ...mod,
        usePropagateTags: () => ({
            propagate: vi.fn(),
            loading: false,
            error: null,
        }),
    };
});

const addNotification = vi.fn();
vi.mock('../../store/useNotificationStore', () => ({
    useNotificationStore: (selector: (state: { addNotification: typeof addNotification }) => unknown) =>
        selector({ addNotification }),
}));

import { ImageViewer } from './ImageViewer';
import { bakeExifOrientationToBlob } from '../../utils/exportImageBake';
import { nefViewer } from '../../utils/nefViewer';
import { toMediaUrl } from '../../utils/mediaUrl';

type ElectronMock = {
    getImageDetails: ReturnType<typeof vi.fn>;
    getImagePhaseStatuses: ReturnType<typeof vi.fn>;
    readExif: ReturnType<typeof vi.fn>;
    setCurrentExportImageContext: ReturnType<typeof vi.fn>;
    updateImageDetails: ReturnType<typeof vi.fn>;
    deleteImage: ReturnType<typeof vi.fn>;
    getFolders: ReturnType<typeof vi.fn>;
    searchSimilarImages: ReturnType<typeof vi.fn>;
    setSingleImageViewOpen: ReturnType<typeof vi.fn>;
    getShowBoundingBox: ReturnType<typeof vi.fn>;
    onShowBoundingBoxChanged: ReturnType<typeof vi.fn>;
    api: {
        propagateTags: ReturnType<typeof vi.fn>;
        fixImageMetadata: ReturnType<typeof vi.fn>;
    };
};

const baseImage = {
    id: 101,
    file_path: '/photos/set1/image.jpg',
    file_name: 'image.jpg',
    score_general: 0.8,
    rating: 2,
    label: null,
    keywords: 'manual',
};

function renderViewer() {
    render(
        <ImageViewer
            image={baseImage}
            onClose={vi.fn()}
            allImages={[baseImage]}
            currentIndex={0}
        />
    );
}

function makeElectronMock(overrides: Partial<ElectronMock> = {}): ElectronMock {
    return {
        getImageDetails: vi.fn().mockResolvedValue({ ...baseImage }),
        getImagePhaseStatuses: vi.fn().mockResolvedValue([]),
        readExif: vi.fn().mockResolvedValue({}),
        setCurrentExportImageContext: vi.fn().mockResolvedValue(true),
        updateImageDetails: vi.fn().mockResolvedValue(true),
        deleteImage: vi.fn().mockResolvedValue(true),
        getFolders: vi.fn().mockResolvedValue([]),
        searchSimilarImages: vi.fn().mockResolvedValue({
            query_image_id: baseImage.id,
            results: [],
            count: 0,
        }),
        setSingleImageViewOpen: vi.fn().mockResolvedValue(true),
        getShowBoundingBox: vi.fn().mockResolvedValue(false),
        onShowBoundingBoxChanged: vi.fn().mockReturnValue(() => {}),
        api: {
            propagateTags: vi.fn().mockResolvedValue({
                success: true,
                message: 'ok',
                data: { suggestions: [] },
            }),
            fixImageMetadata: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
        },
        ...overrides,
    };
}

describe('ImageViewer tag propagation suggestions', () => {
    let electron: ElectronMock;

    beforeEach(() => {
        localStorage.clear();
        addNotification.mockReset();

        electron = makeElectronMock({
            api: {
                propagateTags: vi.fn().mockResolvedValue({
                    success: true,
                    message: 'ok',
                    data: {
                        suggestions: [
                            { keyword: 'sunset', confidence: 0.93 },
                            { keyword: 'noise', confidence: 0.72 },
                        ],
                    },
                }),
                fixImageMetadata: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
            },
        });

        (window as unknown as { electron: ElectronMock }).electron = electron;

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            blob: async () => new Blob(['preview'], { type: 'image/jpeg' }),
        }));
    });

    afterEach(() => {
        (window as unknown as { electron?: ElectronMock }).electron = undefined;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('loads dry-run suggestions when entering edit mode', async () => {
        renderViewer();

        fireEvent.click(screen.getByRole('button', { name: /edit/i }));

        await waitFor(() => {
            expect(electron.api.propagateTags).toHaveBeenCalledWith(expect.objectContaining({
                dry_run: true,
                k: 5,
                min_similarity: 0.85,
                min_keyword_confidence: 0.85,
            }));
        });

        expect(await screen.findByText('sunset')).not.toBeNull();
        expect(screen.queryByText('noise')).toBeNull();
    });

    it('accepts a single suggestion and persists keywords', async () => {
        renderViewer();
        fireEvent.click(screen.getByRole('button', { name: /edit/i }));

        await screen.findByText('sunset');
        fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

        await waitFor(() => {
            expect(electron.updateImageDetails).toHaveBeenCalledWith(baseImage.id, {
                keywords: 'manual, sunset',
            });
        });

        expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    });

    it('rejects a single suggestion and suppresses it on refresh', async () => {
        renderViewer();
        fireEvent.click(screen.getByRole('button', { name: /edit/i }));

        await screen.findByText('sunset');
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

        await waitFor(() => {
            expect(screen.queryByText('sunset')).toBeNull();
        });

        const callsBeforeRefresh = electron.api.propagateTags.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

        await waitFor(() => {
            expect(electron.api.propagateTags.mock.calls.length).toBeGreaterThan(callsBeforeRefresh);
            expect(screen.queryByText('sunset')).toBeNull();
        });
    });

    it('applies all high-confidence suggestions at once', async () => {
        electron.api.propagateTags.mockResolvedValue({
            success: true,
            message: 'ok',
            data: {
                suggestions: [
                    { keyword: 'sunset', confidence: 0.93 },
                    { keyword: 'landscape', confidence: 0.91 },
                ],
            },
        });

        renderViewer();
        fireEvent.click(screen.getByRole('button', { name: /edit/i }));

        await screen.findByText('sunset');
        await screen.findByText('landscape');

        fireEvent.click(screen.getByRole('button', { name: /apply all/i }));

        await waitFor(() => {
            expect(electron.updateImageDetails).toHaveBeenCalledWith(baseImage.id, {
                keywords: 'manual, sunset, landscape',
            });
        });

        expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    });
});

describe('ImageViewer similar images', () => {
    let electron: ElectronMock;

    beforeEach(() => {
        electron = makeElectronMock({
            getImageDetails: vi.fn().mockResolvedValue({ ...baseImage, folder_id: 5 }),
            getFolders: vi.fn().mockResolvedValue([{ id: 5, path: '/photos/trip' }]),
            api: {
                propagateTags: vi.fn(),
                fixImageMetadata: vi.fn(),
            },
        });
        (window as unknown as { electron: ElectronMock }).electron = electron;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            blob: async () => new Blob(['preview'], { type: 'image/jpeg' }),
        }));
    });

    afterEach(() => {
        (window as unknown as { electron?: ElectronMock }).electron = undefined;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('enables Find Similar Images and opens the drawer on click', async () => {
        render(
            <ImageViewer
                image={{ ...baseImage, folder_id: 5 }}
                onClose={vi.fn()}
                allImages={[baseImage]}
                currentIndex={0}
            />
        );

        const findButton = screen.getByRole('button', { name: /find similar images/i }) as HTMLButtonElement;
        expect(findButton.disabled).toBe(false);

        fireEvent.click(findButton);

        expect(await screen.findByRole('heading', { name: 'Similar Images' })).not.toBeNull();
        await waitFor(() => {
            expect(electron.searchSimilarImages).toHaveBeenCalledWith(
                expect.objectContaining({
                    imageId: baseImage.id,
                    minSimilarity: expect.any(Number),
                }),
            );
        });
        const firstCall = electron.searchSimilarImages.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(firstCall.folderId).toBeUndefined();
        expect(firstCall.folderPath).toBeUndefined();
    });
});

describe('ImageViewer Open Folder', () => {
    let electron: ElectronMock;

    beforeEach(() => {
        addNotification.mockReset();

        electron = makeElectronMock({
            getImageDetails: vi.fn().mockResolvedValue({ ...baseImage, folder_id: 5 }),
            api: {
                propagateTags: vi.fn(),
                fixImageMetadata: vi.fn(),
            },
        });
        (window as unknown as { electron: ElectronMock }).electron = electron;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            blob: async () => new Blob(['preview'], { type: 'image/jpeg' }),
        }));
    });

    afterEach(() => {
        (window as unknown as { electron?: ElectronMock }).electron = undefined;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('shows Open Folder when the grid row includes folder_id', async () => {
        electron.getImageDetails.mockResolvedValue({ ...baseImage, folder_id: 72052, rating: 4 });
        const onOpenFolder = vi.fn();
        render(
            <ImageViewer
                image={{ ...baseImage, folder_id: 72052 }}
                onClose={vi.fn()}
                onOpenFolder={onOpenFolder}
                allImages={[{ ...baseImage, folder_id: 72052 }]}
                currentIndex={0}
            />,
        );

        const button = await screen.findByRole('button', { name: /open folder/i });
        fireEvent.click(button);
        expect(onOpenFolder).toHaveBeenCalledWith(72052);
    });

    it('falls back to fallbackFolderId when the grid row lacks folder_id', async () => {
        electron.getImageDetails.mockResolvedValue({ ...baseImage });
        const onOpenFolder = vi.fn();
        render(
            <ImageViewer
                image={baseImage}
                onClose={vi.fn()}
                onOpenFolder={onOpenFolder}
                fallbackFolderId={99}
                allImages={[baseImage]}
                currentIndex={0}
            />,
        );

        const button = await screen.findByRole('button', { name: /open folder/i });
        fireEvent.click(button);
        expect(onOpenFolder).toHaveBeenCalledWith(99);
    });

    it('keeps Open Folder after details load when details omit folder_id', async () => {
        electron.getImageDetails.mockResolvedValue({ ...baseImage, rating: 4, label: 'Blue' });

        render(
            <ImageViewer
                image={{ ...baseImage, folder_id: 72052 }}
                onClose={vi.fn()}
                onOpenFolder={vi.fn()}
                allImages={[{ ...baseImage, folder_id: 72052 }]}
                currentIndex={0}
            />,
        );

        await waitFor(() => {
            expect(electron.getImageDetails).toHaveBeenCalled();
        });

        expect(await screen.findByRole('button', { name: /open folder/i })).not.toBeNull();
    });
});

describe('ImageViewer RAW orientation bake', () => {
    let electron: ElectronMock;
    const nefImage = {
        id: 199125,
        file_path: 'D:/Photos/Z8/180-600mm/2024/2024-06-24/DSC_9300.NEF',
        file_name: 'DSC_9300.NEF',
        score_general: 0.72,
        rating: 3,
        label: 'Blue',
        keywords: '',
        thumbnail_path: '/mnt/d/Projects/image-scoring-backend/thumbnails/ab/abc.jpg',
    };

    beforeEach(() => {
        electron = makeElectronMock({
            getImageDetails: vi.fn().mockResolvedValue({ ...nefImage }),
        });
        (window as unknown as { electron: ElectronMock }).electron = electron;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            blob: async () => new Blob(['preview'], { type: 'image/jpeg' }),
        }));
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: vi.fn(() => 'blob:mock-baked'),
            revokeObjectURL: vi.fn(),
        });
        vi.mocked(bakeExifOrientationToBlob).mockReset();
        vi.mocked(nefViewer.extractWithFallback).mockReset();
        vi.mocked(nefViewer.extractWithFallback).mockResolvedValue(
            new Blob(['extract'], { type: 'image/jpeg' }),
        );
    });

    afterEach(() => {
        (window as unknown as { electron?: ElectronMock }).electron = undefined;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('uses baked blob when bakeExifOrientationToBlob normalizes orientation', async () => {
        const bakedBlob = new Blob(['upright'], { type: 'image/jpeg' });
        vi.mocked(bakeExifOrientationToBlob).mockResolvedValue({
            blob: bakedBlob,
            didNormalize: true,
            sourceOrientation: 8,
            width: 1000,
            height: 1600,
        });

        render(
            <ImageViewer
                image={nefImage}
                onClose={vi.fn()}
                allImages={[nefImage]}
                currentIndex={0}
            />,
        );

        await waitFor(() => {
            expect(nefViewer.extractWithFallback).toHaveBeenCalled();
            expect(bakeExifOrientationToBlob).toHaveBeenCalled();
        });

        const img = await screen.findByAltText('DSC_9300.NEF');
        expect((img as HTMLImageElement).src).toContain('blob:mock-baked');
        expect(URL.createObjectURL).toHaveBeenCalledWith(bakedBlob);
    });

    it('uses full-res extract when bake does not normalize (landscape Orientation 1)', async () => {
        const extractBlob = new Blob(['extract'], { type: 'image/jpeg' });
        vi.mocked(nefViewer.extractWithFallback).mockResolvedValue(extractBlob);
        vi.mocked(bakeExifOrientationToBlob).mockResolvedValue(null);

        render(
            <ImageViewer
                image={nefImage}
                onClose={vi.fn()}
                allImages={[nefImage]}
                currentIndex={0}
            />,
        );

        await waitFor(() => {
            expect(bakeExifOrientationToBlob).toHaveBeenCalled();
        });

        const img = await screen.findByAltText('DSC_9300.NEF');
        expect((img as HTMLImageElement).src).toContain('blob:mock-baked');
        expect(URL.createObjectURL).toHaveBeenCalledWith(extractBlob);
        expect((img as HTMLImageElement).getAttribute('src')).not.toBe(
            toMediaUrl(nefImage.thumbnail_path),
        );
    });
});

describe('ImageViewer bird bounding box', () => {
    let electron: ElectronMock;
    const birdBbox = { x1: 884, y1: 377, x2: 2123, y2: 1672, conf: 0.9138, img_w: 3936, img_h: 2624 };

    beforeEach(() => {
        electron = makeElectronMock();
        (window as unknown as { electron: ElectronMock }).electron = electron;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            blob: async () => new Blob(['preview'], { type: 'image/jpeg' }),
        }));
    });

    afterEach(() => {
        (window as unknown as { electron?: ElectronMock }).electron = undefined;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('reports viewer open on mount and closed on unmount', async () => {
        electron.getImageDetails.mockResolvedValue({ ...baseImage, bird_bbox: birdBbox });
        const { unmount } = render(
            <ImageViewer image={baseImage} onClose={vi.fn()} allImages={[baseImage]} currentIndex={0} />,
        );

        await waitFor(() => {
            expect(electron.setSingleImageViewOpen).toHaveBeenCalledWith(true);
        });

        unmount();
        expect(electron.setSingleImageViewOpen).toHaveBeenLastCalledWith(false);
    });

    it('draws the box as a fraction of the detector image size when the toggle is on', async () => {
        electron.getShowBoundingBox.mockResolvedValue(true);
        electron.getImageDetails.mockResolvedValue({ ...baseImage, bird_bbox: birdBbox });

        render(
            <ImageViewer image={baseImage} onClose={vi.fn()} allImages={[baseImage]} currentIndex={0} />,
        );

        const overlay = await screen.findByTestId('bird-bbox-overlay');
        expect(overlay.style.left).toBe(`${(884 / 3936) * 100}%`);
        expect(overlay.style.top).toBe(`${(377 / 2624) * 100}%`);
        expect(overlay.style.width).toBe(`${((2123 - 884) / 3936) * 100}%`);
        expect(overlay.style.height).toBe(`${((1672 - 377) / 2624) * 100}%`);
    });

    it('hides the box while the toggle is off and shows it when the menu turns it on', async () => {
        let notify: ((show: boolean) => void) | undefined;
        electron.onShowBoundingBoxChanged.mockImplementation((cb: (show: boolean) => void) => {
            notify = cb;
            return () => {};
        });
        electron.getImageDetails.mockResolvedValue({ ...baseImage, bird_bbox: birdBbox });

        render(
            <ImageViewer image={baseImage} onClose={vi.fn()} allImages={[baseImage]} currentIndex={0} />,
        );

        await waitFor(() => expect(notify).toBeDefined());
        expect(screen.queryByTestId('bird-bbox-overlay')).toBeNull();

        act(() => notify!(true));
        expect(await screen.findByTestId('bird-bbox-overlay')).not.toBeNull();
    });

    it('draws nothing and omits the score row when the image has no detection', async () => {
        electron.getShowBoundingBox.mockResolvedValue(true);
        electron.getImageDetails.mockResolvedValue({ ...baseImage, bird_bbox: null });

        render(
            <ImageViewer image={baseImage} onClose={vi.fn()} allImages={[baseImage]} currentIndex={0} />,
        );

        await waitFor(() => expect(electron.getImageDetails).toHaveBeenCalled());
        expect(screen.queryByTestId('bird-bbox-overlay')).toBeNull();
        expect(screen.queryByText('Bird Detection')).toBeNull();
    });

    it('shows the detection confidence in Model Scores regardless of the toggle', async () => {
        electron.getImageDetails.mockResolvedValue({ ...baseImage, bird_bbox: birdBbox });

        render(
            <ImageViewer image={baseImage} onClose={vi.fn()} allImages={[baseImage]} currentIndex={0} />,
        );

        expect(await screen.findByText('Bird Detection')).not.toBeNull();
        expect(screen.getByText('91%')).not.toBeNull();
    });
});

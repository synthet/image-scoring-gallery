import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImageOpener } from './useImageOpener';

const addNotification = vi.fn();

vi.mock('../store/useNotificationStore', () => ({
  useNotificationStore: (selector: (state: { addNotification: typeof addNotification }) => unknown) =>
    selector({ addNotification }),
}));

type ImageRecord = {
  id: number;
  file_path: string;
  file_name: string;
  score_general: number;
  rating: number;
  label: string | null;
  stack_id?: number | null;
  sub_stack_id?: number | null;
  image_count?: number;
  name?: string | null;
  folder_id?: number;
};

function img(id: number, extra: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id,
    file_path: `/images/${id}.jpg`,
    file_name: `${id}.jpg`,
    score_general: 0.5,
    rating: 0,
    label: null,
    ...extra,
  };
}

function defaultParams(currentImages: ImageRecord[], overrides: Record<string, unknown> = {}) {
  return {
    currentImages,
    activeStackId: null as number | null,
    activeSubStackId: null as number | null,
    selectedFolderId: 4,
    onNavigateToFolder: vi.fn(),
    removeImage: vi.fn(),
    handleImageDeleteFromStack: vi.fn(),
    ...overrides,
  };
}

describe('useImageOpener', () => {
  const removeImage = vi.fn();
  const handleImageDeleteFromStack = vi.fn();
  const onNavigateToFolder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (window as unknown as { electron?: unknown }).electron = undefined;
  });

  it('uses the visible grid list when opening a sub-stack landing card by id', async () => {
    const subStackCards = [
      img(101, { stack_id: 7, sub_stack_id: 70, image_count: 3, name: 'Visual group' }),
      img(102, { stack_id: 7, sub_stack_id: null, image_count: 1, name: 'Ungrouped' }),
    ];
    (window as unknown as { electron?: unknown }).electron = {
      getImageDetails: vi.fn().mockResolvedValue({ ...subStackCards[1], folder_id: 4 }),
    };

    const { result } = renderHook(() => useImageOpener({
      ...defaultParams(subStackCards, {
        activeStackId: 7,
        removeImage,
        handleImageDeleteFromStack,
        onNavigateToFolder,
      }),
    }));

    await act(async () => {
      await result.current.openImageById(102);
    });

    expect(result.current.currentImageIndex).toBe(1);
    expect(result.current.openingImage).toEqual(subStackCards[1]);
    expect(result.current.pendingOpenImageId).toBeNull();
    expect(result.current.viewerImages).toEqual(subStackCards);
  });

  it('sets pendingOpenImageId when id is not in current list, then resolves when list updates', async () => {
    const getImageDetails = vi.fn().mockResolvedValue({
      ...img(99),
      folder_id: 4,
    });
    (window as unknown as { electron?: unknown }).electron = { getImageDetails };

    const { result, rerender } = renderHook(
      ({ currentImages }) => useImageOpener({
        ...defaultParams(currentImages, { removeImage, handleImageDeleteFromStack, onNavigateToFolder }),
      }),
      { initialProps: { currentImages: [] as ImageRecord[] } },
    );

    await act(async () => {
      await result.current.openImageById(99);
    });

    expect(result.current.pendingOpenImageId).toBe(99);
    expect(result.current.currentImageIndex).toBe(-1);

    rerender({ currentImages: [img(98), img(99)] });

    await waitFor(() => {
      expect(result.current.pendingOpenImageId).toBeNull();
    });
    expect(result.current.currentImageIndex).toBe(1);
    expect(result.current.openingImage?.id).toBe(99);
  });

  it('openImageFromSearch sets viewerListOverride for prev/next', async () => {
    const searchResults = [
      { image_id: 201, file_path: '/images/201.jpg' },
      { image_id: 202, file_path: '/images/202.jpg' },
    ];
    (window as unknown as { electron?: unknown }).electron = {
      getImageDetails: vi.fn().mockResolvedValue({ ...img(202), folder_id: 4, rating: 2 }),
    };

    const { result } = renderHook(() => useImageOpener({
      ...defaultParams([img(1)], { removeImage, handleImageDeleteFromStack, onNavigateToFolder }),
    }));

    await act(async () => {
      await result.current.openImageFromSearch(202, searchResults);
    });

    expect(result.current.viewerImages.map((r) => r.id)).toEqual([201, 202]);
    expect(result.current.currentImageIndex).toBe(1);
    expect(result.current.pendingOpenImageId).toBeNull();
  });

  it('openImageById returns false and notifies when details are missing', async () => {
    (window as unknown as { electron?: unknown }).electron = {
      getImageDetails: vi.fn().mockResolvedValue(null),
    };

    const { result } = renderHook(() => useImageOpener({
      ...defaultParams([img(1)], { removeImage, handleImageDeleteFromStack, onNavigateToFolder }),
    }));

    let ok = true;
    await act(async () => {
      ok = await result.current.openImageById(404);
    });

    expect(ok).toBe(false);
    expect(addNotification).toHaveBeenCalledWith('Unable to locate image details', 'warning');
  });

  it('openImageFromList opens immediately without prefetching getImageDetails', async () => {
    const getImageDetails = vi.fn();
    (window as unknown as { electron?: unknown }).electron = { getImageDetails };
    const list = [img(10), img(11)];

    const { result } = renderHook(() => useImageOpener({
      ...defaultParams(list, { removeImage, handleImageDeleteFromStack, onNavigateToFolder }),
    }));

    let ok = false;
    await act(async () => {
      ok = await result.current.openImageFromList(11, list);
    });

    expect(ok).toBe(true);
    expect(getImageDetails).not.toHaveBeenCalled();
    expect(result.current.openingImage?.id).toBe(11);
    expect(result.current.currentImageIndex).toBe(1);
  });

  it('closeViewer clears override, pending id, and opening image', async () => {
    const subStackCards = [img(101), img(102)];
    (window as unknown as { electron?: unknown }).electron = {
      getImageDetails: vi.fn().mockResolvedValue({ ...subStackCards[0], folder_id: 4 }),
    };

    const { result } = renderHook(() => useImageOpener({
      ...defaultParams(subStackCards, { removeImage, handleImageDeleteFromStack, onNavigateToFolder }),
    }));

    await act(async () => {
      await result.current.openImageById(101);
    });
    expect(result.current.openingImage).not.toBeNull();

    act(() => {
      result.current.closeViewer();
    });

    expect(result.current.openingImage).toBeNull();
    expect(result.current.pendingOpenImageId).toBeNull();
    expect(result.current.viewerImages).toEqual(subStackCards);
  });
});

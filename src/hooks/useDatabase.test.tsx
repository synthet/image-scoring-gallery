import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImages, useStacks } from './useDatabase';

type ImageRecord = {
  id: number;
  file_path: string;
  file_name: string;
  score_general: number;
  score_technical: number;
  score_aesthetic: number;
  score_spaq: number;
  score_ava: number;
  score_liqe: number;
  rating: number;
  label: string | null;
  stack_key?: number;
  image_count?: number;
  rep_image_id?: number;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type ElectronApi = {
  getImages: ReturnType<typeof vi.fn>;
  getImageCount: ReturnType<typeof vi.fn>;
  getStacks?: ReturnType<typeof vi.fn>;
  getStackCount?: ReturnType<typeof vi.fn>;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildImage(id: number): ImageRecord {
  return {
    id,
    file_path: `/images/${id}.jpg`,
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

describe('useImages race safety', () => {
  let electronApi: ElectronApi;

  beforeEach(() => {
    electronApi = {
      getImages: vi.fn(),
      getImageCount: vi.fn(),
    };
    (window as any).electron = electronApi;
  });

  afterEach(() => {
    (window as any).electron = undefined;
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent loadMore calls while a request is in flight', async () => {
    const deferred = createDeferred<ImageRecord[]>();
    electronApi.getImageCount.mockResolvedValue(4);
    electronApi.getImages.mockImplementation(() => deferred.promise);

    const { result } = renderHook(() => useImages(2, 99));

    await waitFor(() => {
      expect(electronApi.getImages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(electronApi.getImages).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve([buildImage(1), buildImage(2)]);
      await deferred.promise;
    });

    await waitFor(() => {
      expect(result.current.images.map(image => image.id)).toEqual([1, 2]);
      expect(result.current.loading).toBe(false);
    });
  });

  it('ignores stale in-flight responses after refresh starts a newer request', async () => {
    const staleRequest = createDeferred<ImageRecord[]>();
    electronApi.getImageCount.mockResolvedValue(10);
    electronApi.getImages
      .mockImplementationOnce(() => staleRequest.promise)
      .mockResolvedValueOnce([buildImage(200)]);

    const { result } = renderHook(() => useImages(1, 7));

    await waitFor(() => {
      expect(electronApi.getImages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(electronApi.getImages).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      staleRequest.resolve([buildImage(100)]);
      await staleRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.images.map(image => image.id)).toEqual([200]);
    });
  });
});

describe('useStacks removeStackByImageId', () => {
  let electronApi: ElectronApi;

  beforeEach(() => {
    electronApi = {
      getImages: vi.fn(),
      getImageCount: vi.fn(),
      getStacks: vi.fn(),
      getStackCount: vi.fn(),
    };
    (window as unknown as { electron?: unknown }).electron = electronApi;
  });

  afterEach(() => {
    (window as unknown as { electron?: unknown }).electron = undefined;
    vi.restoreAllMocks();
  });

  function buildStackRow(
    id: number,
    extra: Partial<ImageRecord> = {},
  ): ImageRecord {
    return {
      ...buildImage(id),
      stack_key: -id,
      image_count: 1,
      rep_image_id: id,
      ...extra,
    };
  }

  it('removes singleton stack cards matched by image id', async () => {
    electronApi.getStackCount!.mockResolvedValue(2);
    electronApi.getStacks!.mockResolvedValue([
      buildStackRow(10),
      buildStackRow(20),
    ]);

    const { result } = renderHook(() => useStacks(50, 99, undefined, true));

    await waitFor(() => {
      expect(result.current.stacks.map((row) => row.id)).toEqual([10, 20]);
    });

    act(() => {
      result.current.removeStackByImageId(10);
    });

    expect(result.current.stacks.map((row) => row.id)).toEqual([20]);
    expect(result.current.totalCount).toBe(1);
  });

  it('removes multi-image stack cards matched by rep_image_id', async () => {
    const multiStack: ImageRecord = {
      ...buildImage(50),
      stack_key: 7,
      image_count: 4,
      rep_image_id: 50,
    };
    electronApi.getStackCount!.mockResolvedValue(1);
    electronApi.getStacks!.mockResolvedValue([multiStack]);

    const { result } = renderHook(() => useStacks(50, 99, undefined, true));

    await waitFor(() => {
      expect(result.current.stacks).toHaveLength(1);
    });

    act(() => {
      result.current.removeStackByImageId(50);
    });

    expect(result.current.stacks).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
  });
});

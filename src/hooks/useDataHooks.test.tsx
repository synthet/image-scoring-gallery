import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFolders } from './useFolders';
import { useImageCount, useKeywords } from './useDatabase';

type ElectronApi = {
  getFolders: ReturnType<typeof vi.fn>;
  getImageCount: ReturnType<typeof vi.fn>;
  getKeywords: ReturnType<typeof vi.fn>;
  api?: {
    getScopeTree: ReturnType<typeof vi.fn>;
  };
};

describe('data hooks', () => {
  let electronApi: ElectronApi;

  beforeEach(() => {
    electronApi = {
      getFolders: vi.fn(),
      getImageCount: vi.fn(),
      getKeywords: vi.fn(),
      api: {
        getScopeTree: vi.fn().mockResolvedValue(null),
      },
    };
    (window as any).electron = electronApi;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (window as any).electron = undefined;
  });

  it('useFolders loads folder tree and supports refresh', async () => {
    electronApi.getFolders
      .mockResolvedValueOnce([
        { id: 1, path: '/photos', parent_id: null, is_fully_scored: 0, image_count: 1 },
        { id: 2, path: '/photos/set-a', parent_id: 1, is_fully_scored: 1, image_count: 2 },
      ])
      .mockResolvedValueOnce([
        { id: 3, path: '/new-root', parent_id: null, is_fully_scored: 0, image_count: 4 },
      ]);

    const { result } = renderHook(() => useFolders());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.folders).toHaveLength(1);
    expect(result.current.folders[0].title).toBe('photos');
    expect(result.current.folders[0].total_image_count).toBe(3);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.folders[0].id).toBe(3);
    });

    expect(electronApi.getFolders).toHaveBeenCalledTimes(2);
  });

  it('useFolders handles fetch failure and clears loading', async () => {
    electronApi.getFolders.mockRejectedValue(new Error('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useFolders());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.folders).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useFolders] Failed to fetch folders:',
      expect.any(Error)
    );
  });

  it('useImageCount sets numeric count and loading false', async () => {
    electronApi.getImageCount.mockResolvedValue(123);

    const { result } = renderHook(() => useImageCount());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.count).toBe(123);
  });

  it('useKeywords only fetches once and ignores non-array responses', async () => {
    electronApi.getKeywords.mockResolvedValueOnce(['a', 'b']).mockResolvedValueOnce('not-array');

    const { result } = renderHook(() => useKeywords());

    await act(async () => {
      result.current.fetch();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.keywords).toEqual(['a', 'b']);

    await act(async () => {
      result.current.fetch();
    });

    expect(electronApi.getKeywords).toHaveBeenCalledTimes(1);
  });
});

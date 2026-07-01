import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FilterState } from '../components/Sidebar/FilterPanel';
import { useStacksMode } from './useStacksMode';

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
  is_ungrouped_sub_stack?: boolean;
};

type ElectronApi = {
  getImagesByStack: ReturnType<typeof vi.fn>;
  getImagesByStackUngrouped: ReturnType<typeof vi.fn>;
  getSubstacksForStack: ReturnType<typeof vi.fn>;
  getImagesBySubStack: ReturnType<typeof vi.fn>;
  getStackCacheStatus: ReturnType<typeof vi.fn>;
  rebuildStackCache: ReturnType<typeof vi.fn>;
};

const filters: FilterState = {
  minRating: 0,
  sortBy: 'score_general',
  order: 'DESC',
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

describe('useStacksMode sub-stack navigation', () => {
  let electronApi: ElectronApi;

  beforeEach(() => {
    electronApi = {
      getImagesByStack: vi.fn(),
      getImagesByStackUngrouped: vi.fn(),
      getSubstacksForStack: vi.fn(),
      getImagesBySubStack: vi.fn(),
      getStackCacheStatus: vi.fn().mockResolvedValue({ cached: 42, expected: 42, stale: false }),
      rebuildStackCache: vi.fn().mockResolvedValue({ success: true, count: 0 }),
    };
    (window as Window & { electron?: Partial<ElectronApi> }).electron = electronApi;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (window as Window & { electron?: Partial<ElectronApi> }).electron = undefined;
  });

  it('auto-opens sub-stack detail when a root stack has one persisted sub-stack', async () => {
    const subStack = img(101, { stack_id: 7, sub_stack_id: 70, image_count: 3 });
    const subStackImage = img(102, { stack_id: 7, sub_stack_id: 70 });
    electronApi.getSubstacksForStack.mockResolvedValue([subStack]);
    electronApi.getImagesBySubStack.mockResolvedValue([subStackImage]);

    const { result } = renderHook(() => useStacksMode(filters, vi.fn(), false));

    act(() => {
      result.current.handleSelectStack(img(1, { stack_id: 7, image_count: 9 }), vi.fn());
    });

    await waitFor(() => {
      expect(result.current.activeStackDisplayImages).toEqual([subStackImage]);
    });

    expect(electronApi.getSubstacksForStack).toHaveBeenCalledWith(7, filters);
    expect(electronApi.getImagesByStack).not.toHaveBeenCalled();
    expect(electronApi.getImagesBySubStack).toHaveBeenCalledWith(70, filters);
    expect(result.current.hasSubStackCards).toBe(false);
    expect(result.current.activeSubStackId).toBe(70);
  });

  it('falls back to the flat root stack image view when no sub-stacks exist', async () => {
    const stackImage = img(201, { stack_id: 8 });
    electronApi.getSubstacksForStack.mockResolvedValue([]);
    electronApi.getImagesByStack.mockResolvedValue([stackImage]);

    const { result } = renderHook(() => useStacksMode(filters, vi.fn(), false));

    act(() => {
      result.current.handleSelectStack(img(2, { stack_id: 8, image_count: 1 }), vi.fn());
    });

    await waitFor(() => {
      expect(result.current.activeStackDisplayImages).toEqual([stackImage]);
    });

    expect(result.current.hasSubStackCards).toBe(false);
    expect(electronApi.getImagesByStack).toHaveBeenCalledWith(8, filters);
  });

  it('auto-opens sub-stack detail when the only sub-stack maps one-to-one with the stack', async () => {
    const subStack = img(251, { stack_id: 12, sub_stack_id: 120, image_count: 3 });
    const subStackImage = img(252, { stack_id: 12, sub_stack_id: 120 });
    electronApi.getSubstacksForStack.mockResolvedValue([subStack]);
    electronApi.getImagesBySubStack.mockResolvedValue([subStackImage]);

    const { result } = renderHook(() => useStacksMode(filters, vi.fn(), false));

    act(() => {
      result.current.handleSelectStack(img(6, { stack_id: 12, image_count: 3 }), vi.fn());
    });

    await waitFor(() => {
      expect(result.current.activeStackDisplayImages).toEqual([subStackImage]);
    });

    expect(result.current.hasSubStackCards).toBe(false);
    expect(result.current.activeSubStackId).toBe(120);
    expect(electronApi.getImagesBySubStack).toHaveBeenCalledWith(120, filters);
    expect(electronApi.getImagesByStack).not.toHaveBeenCalled();
  });

  it('loads sub-stack images after selecting a sub-stack card from a multi-card landing', async () => {
    const subStackA = img(301, { stack_id: 9, sub_stack_id: 90, image_count: 2 });
    const subStackB = img(302, { stack_id: 9, sub_stack_id: 91, image_count: 2 });
    const subStackImage = img(303, { stack_id: 9, sub_stack_id: 90 });
    electronApi.getSubstacksForStack.mockResolvedValue([subStackA, subStackB]);
    electronApi.getImagesBySubStack.mockResolvedValue([subStackImage]);

    const { result } = renderHook(() => useStacksMode(filters, vi.fn(), false));

    act(() => {
      result.current.handleSelectStack(img(3, { stack_id: 9, image_count: 4 }), vi.fn());
    });

    await waitFor(() => {
      expect(result.current.hasSubStackCards).toBe(true);
    });

    act(() => {
      result.current.handleSelectSubStack(subStackA);
    });

    await waitFor(() => {
      expect(result.current.activeStackDisplayImages).toEqual([subStackImage]);
    });

    expect(electronApi.getImagesBySubStack).toHaveBeenCalledWith(90, filters);
  });

  it('loads ungrouped stack images after selecting the synthetic ungrouped card', async () => {
    const subStack = img(401, { stack_id: 10, sub_stack_id: 100, image_count: 2 });
    const ungrouped = img(402, {
      stack_id: 10,
      sub_stack_id: null,
      image_count: 1,
      name: 'Ungrouped',
      is_ungrouped_sub_stack: true,
    });
    const ungroupedImage = img(403, { stack_id: 10, sub_stack_id: null });
    electronApi.getSubstacksForStack.mockResolvedValue([subStack, ungrouped]);
    electronApi.getImagesByStackUngrouped.mockResolvedValue([ungroupedImage]);

    const { result } = renderHook(() => useStacksMode(filters, vi.fn(), false));

    act(() => {
      result.current.handleSelectStack(img(4, { stack_id: 10, image_count: 3 }), vi.fn());
    });

    await waitFor(() => {
      expect(result.current.hasSubStackCards).toBe(true);
    });

    act(() => {
      result.current.handleSelectSubStack(ungrouped);
    });

    await waitFor(() => {
      expect(result.current.activeStackDisplayImages).toEqual([ungroupedImage]);
    });

    expect(result.current.activeUngroupedSubStack).toBe(true);
    expect(result.current.hasSubStackCards).toBe(false);
    expect(result.current.activeSubStackInfo).toEqual({ subStackId: null, imageCount: 1, name: 'Ungrouped' });
    expect(electronApi.getImagesByStackUngrouped).toHaveBeenCalledWith(10, filters);

    act(() => {
      result.current.clearSubStack();
    });

    await waitFor(() => {
      expect(result.current.hasSubStackCards).toBe(true);
    });
    expect(result.current.activeStackDisplayImages).toEqual([subStack, ungrouped]);
  });

  it('refreshes the active ungrouped stack view', async () => {
    const ungrouped = img(501, {
      stack_id: 11,
      sub_stack_id: null,
      image_count: 1,
      name: 'Ungrouped',
      is_ungrouped_sub_stack: true,
    });
    const beforeRefresh = img(502, { stack_id: 11, sub_stack_id: null });
    const afterRefresh = img(503, { stack_id: 11, sub_stack_id: null });
    electronApi.getSubstacksForStack.mockResolvedValue([ungrouped]);
    electronApi.getImagesByStackUngrouped
      .mockResolvedValueOnce([beforeRefresh])
      .mockResolvedValueOnce([afterRefresh]);

    const { result } = renderHook(() => useStacksMode(filters, vi.fn(), false));

    act(() => {
      result.current.handleSelectStack(img(5, { stack_id: 11, image_count: 1 }), vi.fn());
    });

    await waitFor(() => {
      expect(result.current.activeUngroupedSubStack).toBe(true);
      expect(result.current.activeStackDisplayImages).toEqual([beforeRefresh]);
    });

    expect(result.current.hasSubStackCards).toBe(false);

    await act(async () => {
      await result.current.refreshActiveStackView();
    });

    expect(result.current.activeStackDisplayImages).toEqual([afterRefresh]);
    expect(electronApi.getImagesByStackUngrouped).toHaveBeenCalledTimes(2);
  });

  it('exits the stack entirely when backing out of an auto-opened single sub-stack', async () => {
    const subStack = img(601, { stack_id: 13, sub_stack_id: 130, image_count: 2 });
    const subStackImage = img(602, { stack_id: 13, sub_stack_id: 130 });
    electronApi.getSubstacksForStack.mockResolvedValue([subStack]);
    electronApi.getImagesBySubStack.mockResolvedValue([subStackImage]);

    const { result } = renderHook(() => useStacksMode(filters, vi.fn(), false));

    act(() => {
      result.current.handleSelectStack(img(7, { stack_id: 13, image_count: 2 }), vi.fn());
    });

    await waitFor(() => {
      expect(result.current.activeSubStackId).toBe(130);
    });

    act(() => {
      result.current.clearSubStack();
    });

    expect(result.current.activeStackId).toBeNull();
    expect(result.current.activeSubStackId).toBeNull();
    expect(result.current.hasSubStackCards).toBe(false);
  });

  it('skips stack cache rebuild when cache is fresh', async () => {
    const refreshStacks = vi.fn();
    electronApi.getStackCacheStatus.mockResolvedValue({ cached: 120, expected: 120, stale: false });

    const { result } = renderHook(() => useStacksMode(filters, refreshStacks, false));

    act(() => {
      result.current.enableStacksMode(true);
    });

    await waitFor(() => {
      expect(electronApi.getStackCacheStatus).toHaveBeenCalled();
      expect(electronApi.rebuildStackCache).not.toHaveBeenCalled();
      expect(refreshStacks).toHaveBeenCalled();
    });
  });

  it('rebuilds stack cache when cache is empty but images have stacks', async () => {
    const refreshStacks = vi.fn();
    electronApi.getStackCacheStatus.mockResolvedValue({ cached: 0, expected: 15, stale: true });

    const { result } = renderHook(() => useStacksMode(filters, refreshStacks, false));

    act(() => {
      result.current.enableStacksMode(true);
    });

    await waitFor(() => {
      expect(electronApi.rebuildStackCache).toHaveBeenCalled();
    });

    expect(refreshStacks).toHaveBeenCalled();
  });

  it('rebuilds stack cache when cache is stale', async () => {
    const refreshStacks = vi.fn();
    electronApi.getStackCacheStatus.mockResolvedValue({ cached: 9758, expected: 9773, stale: true });

    const { result } = renderHook(() => useStacksMode(filters, refreshStacks, false));

    act(() => {
      result.current.enableStacksMode(true);
    });

    await waitFor(() => {
      expect(electronApi.rebuildStackCache).toHaveBeenCalled();
    });

    expect(refreshStacks).toHaveBeenCalled();
  });
});

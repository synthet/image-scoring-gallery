import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useOutlierMarkers } from './useOutlierMarkers';

const findOutliersMock = vi.fn();

vi.mock('../bridge', () => ({
  bridge: {
    findOutliers: (...args: unknown[]) => findOutliersMock(...args),
  },
}));

describe('useOutlierMarkers', () => {
  beforeEach(() => {
    findOutliersMock.mockReset();
  });

  it('fetches outliers when highlighting is enabled', async () => {
    findOutliersMock.mockResolvedValue({
      outliers: [
        {
          image_id: 42,
          file_path: '/tmp/a.jpg',
          outlier_score: 1.7,
          z_score: 3.25,
          nearest_neighbors: [{ image_id: 7, file_path: '/tmp/b.jpg', similarity: 0.88 }],
        },
      ],
    });

    const { result } = renderHook(() => useOutlierMarkers({ enabled: true, folderPath: '/photos' }));

    await waitFor(() => {
      expect(findOutliersMock).toHaveBeenCalledWith({ folderPath: '/photos', zThreshold: 2.5, k: 10, limit: 200 });
      expect(result.current.outlierIds.has(42)).toBe(true);
      expect(result.current.outlierMetaById.get(42)?.zScore).toBe(3.25);
      expect(result.current.outlierMetaById.get(42)?.neighborSummary).toBe(
        'Nearest match (id 7, 88% similar)',
      );
    });
  });

  it('cleans up outlier state when folder changes', async () => {
    findOutliersMock
      .mockResolvedValueOnce({
        outliers: [
          {
            image_id: 10,
            file_path: '/f1/a.jpg',
            outlier_score: 1.1,
            z_score: 2.8,
            nearest_neighbors: [],
          },
        ],
      })
      .mockResolvedValueOnce({ outliers: [] });

    const { result, rerender } = renderHook(
      ({ folderPath }) => useOutlierMarkers({ enabled: true, folderPath }),
      { initialProps: { folderPath: '/folder-a' } },
    );

    await waitFor(() => {
      expect(result.current.outlierIds.has(10)).toBe(true);
    });

    rerender({ folderPath: '/folder-b' });

    expect(result.current.outlierIds.size).toBe(0);

    await waitFor(() => {
      expect(findOutliersMock).toHaveBeenLastCalledWith({ folderPath: '/folder-b', zThreshold: 2.5, k: 10, limit: 200 });
    });
  });
});

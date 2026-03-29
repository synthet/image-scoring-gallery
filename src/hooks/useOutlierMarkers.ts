import { useEffect, useMemo, useState } from 'react';
import { bridge } from '../bridge';

interface OutlierNeighbor {
  image_id: number;
  file_path: string;
  similarity: number;
}

interface OutlierInfo {
  image_id: number;
  file_path: string;
  outlier_score: number;
  z_score: number;
  nearest_neighbors: OutlierNeighbor[];
}

export interface OutlierMeta {
  zScore: number;
  outlierScore: number;
  neighborSummary: string;
}

interface UseOutlierMarkersOptions {
  enabled: boolean;
  folderPath?: string;
  zThreshold?: number;
  k?: number;
  limit?: number;
  refreshKey?: number;
}

export function useOutlierMarkers({
  enabled,
  folderPath,
  zThreshold = 2.5,
  k = 10,
  limit = 200,
  refreshKey = 0,
}: UseOutlierMarkersOptions) {
  const [outliers, setOutliers] = useState<OutlierInfo[]>([]);

  useEffect(() => {
    if (!enabled || !folderPath) {
      setOutliers([]);
      return;
    }

    let isActive = true;
    setOutliers([]);

    bridge.findOutliers({ folderPath, zThreshold, k, limit })
      .then((response) => {
        if (!isActive) return;
        setOutliers(response?.outliers || []);
      })
      .catch((error) => {
        console.error('[useOutlierMarkers] Failed to fetch outliers', error);
        if (!isActive) return;
        setOutliers([]);
      });

    return () => {
      isActive = false;
    };
  }, [enabled, folderPath, zThreshold, k, limit, refreshKey]);

  const outlierIds = useMemo(() => new Set(outliers.map((item) => item.image_id)), [outliers]);

  const outlierMetaById = useMemo(() => {
    const byId = new Map<number, OutlierMeta>();
    outliers.forEach((item) => {
      const nearest = item.nearest_neighbors?.[0];
      const neighborSummary = nearest
        ? `Nearest: #${nearest.image_id} (${Math.round(nearest.similarity * 100)}%)`
        : 'Nearest: none';
      byId.set(item.image_id, {
        zScore: item.z_score,
        outlierScore: item.outlier_score,
        neighborSummary,
      });
    });
    return byId;
  }, [outliers]);

  return {
    outlierIds,
    outlierMetaById,
  };
}

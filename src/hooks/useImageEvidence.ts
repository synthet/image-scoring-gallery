import { useEffect, useState } from 'react';
import { bridge } from '../bridge';
import type { ImageEvidencePayload } from '../types/imageEvidence';

const cache = new Map<number, ImageEvidencePayload | null>();

export function clearImageEvidenceCacheForTests(): void {
    cache.clear();
}

export function useImageEvidence(imageId: number | null, enabled: boolean): {
    data: ImageEvidencePayload | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
} {
    const [result, setResult] = useState<{
        imageId: number;
        tick: number;
        data: ImageEvidencePayload | null;
        error: string | null;
    } | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!enabled || imageId == null) return;
        if (cache.has(imageId) && tick === 0) return;
        let active = true;
        void bridge.getImageEvidence(imageId).then(
            (payload) => {
                if (!active) return;
                const typed = payload as ImageEvidencePayload | null;
                cache.set(imageId, typed);
                setResult({ imageId, tick, data: typed, error: null });
            },
            (err: unknown) => {
                if (!active) return;
                cache.set(imageId, null);
                setResult({
                    imageId,
                    tick,
                    data: null,
                    error: err instanceof Error ? err.message : 'Evidence fetch failed',
                });
            },
        );
        return () => {
            active = false;
        };
    }, [imageId, enabled, tick]);

    const currentResult = result?.imageId === imageId && result.tick === tick ? result : null;
    const cached = imageId != null && tick === 0 ? cache.get(imageId) : undefined;
    const active = enabled && imageId != null;
    return {
        data: active ? currentResult?.data ?? cached ?? null : null,
        loading: active && !currentResult && cached === undefined,
        error: active ? currentResult?.error ?? null : null,
        refresh: () => setTick((t) => t + 1),
    };
}

import { useEffect, useMemo, useState } from 'react';
import { bridge } from '../bridge';
import type { ImageEyeKeypoints } from '../../electron/types';

/** Follows View > Eyes from the main-process menu. */
export function useShowEyes(): boolean {
    const [show, setShow] = useState(false);
    useEffect(() => {
        let active = true;
        void bridge.getShowEyes().then((value) => {
            if (active) setShow(value);
        });
        const unsubscribe = bridge.onShowEyesChanged((value) => setShow(value));
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);
    return show;
}

const CHUNK = 400;
/** Session cache: `null` = fetched, no visible eye. Keypoints change only when the backend re-runs. */
const cache = new Map<number, ImageEyeKeypoints | null>();

export function clearEyeKeypointsCacheForTests(): void {
    cache.clear();
}

/**
 * Visible eye keypoints for `ids`, fetched in batches while `enabled`. Returns a map that only
 * contains images with at least one visible eye.
 */
export function useEyeKeypoints(ids: readonly number[], enabled: boolean): Map<number, ImageEyeKeypoints> {
    const [version, setVersion] = useState(0);
    const key = enabled ? ids.join(',') : '';

    useEffect(() => {
        if (!enabled) return;
        const missing = [...new Set(ids)].filter((id) => !cache.has(id));
        if (missing.length === 0) return;
        let active = true;
        void (async () => {
            for (let i = 0; i < missing.length; i += CHUNK) {
                const chunk = missing.slice(i, i + CHUNK);
                try {
                    const found = await bridge.getEyeKeypoints(chunk);
                    for (const id of chunk) cache.set(id, found[id] ?? null);
                } catch (err) {
                    console.warn('[eyes] keypoint fetch failed', err);
                    return;
                }
                if (active) setVersion((v) => v + 1);
            }
        })();
        return () => {
            active = false;
        };
        // `key` stands in for `ids` so a new array with the same ids does not refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled]);

    return useMemo(() => {
        const out = new Map<number, ImageEyeKeypoints>();
        if (!enabled) return out;
        for (const id of ids) {
            const entry = cache.get(id);
            if (entry) out.set(id, entry);
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled, version]);
}

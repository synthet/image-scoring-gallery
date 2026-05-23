import { useEffect, useRef, useState } from 'react';
import type { AdaptiveProgressConfig } from '../utils/similarSearchTiming';

const COMPLETE_HOLD_MS = 280;
const STALL_RATIO = 0.9;

/**
 * Simulates progress toward ~90% while `active`, then snaps to max when inactive.
 * Used when real completion percentage is unknown (IPC/API latency).
 */
export function useAdaptiveLoadingProgress(
    active: boolean,
    config: AdaptiveProgressConfig,
): { tick: number; progressMax: number; percent: number } {
    const { progressMax, tickMs, estimatedMs } = config;
    const stallTick = Math.max(1, Math.floor(progressMax * STALL_RATIO));

    const [tick, setTick] = useState(0);
    const wasActiveRef = useRef(false);

    useEffect(() => {
        if (!active) {
            return;
        }

        setTick(0);
        const startedAt = performance.now();
        const intervalId = window.setInterval(() => {
            const elapsed = performance.now() - startedAt;
            const ratio = Math.min(1, elapsed / Math.max(estimatedMs, 1));
            const eased = 1 - (1 - ratio) ** 2;
            setTick(Math.min(stallTick, Math.max(0, Math.floor(eased * stallTick))));
        }, tickMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [active, tickMs, estimatedMs, stallTick]);

    useEffect(() => {
        if (active) {
            wasActiveRef.current = true;
            return;
        }

        if (!wasActiveRef.current) {
            return;
        }

        wasActiveRef.current = false;
        setTick(progressMax);
        const resetId = window.setTimeout(() => setTick(0), COMPLETE_HOLD_MS);
        return () => window.clearTimeout(resetId);
    }, [active, progressMax]);

    const percent = progressMax > 0 ? Math.min(100, Math.round((tick / progressMax) * 100)) : 0;

    return { tick, progressMax, percent };
}

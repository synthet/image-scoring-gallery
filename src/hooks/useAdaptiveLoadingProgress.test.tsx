import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdaptiveLoadingProgress } from './useAdaptiveLoadingProgress';

describe('useAdaptiveLoadingProgress', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('advances tick while active and completes when inactive', () => {
        const config = { progressMax: 100, tickMs: 50, estimatedMs: 1000 };
        const { result, rerender } = renderHook(
            ({ active }) => useAdaptiveLoadingProgress(active, config),
            { initialProps: { active: true } },
        );

        expect(result.current.tick).toBe(0);

        act(() => {
            vi.advanceTimersByTime(400);
        });
        expect(result.current.tick).toBeGreaterThan(0);
        expect(result.current.percent).toBeGreaterThan(0);

        rerender({ active: false });
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(result.current.tick).toBe(0);
    });
});

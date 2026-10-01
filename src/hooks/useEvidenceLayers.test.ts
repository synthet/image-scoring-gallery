import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEvidenceLayers } from './useEvidenceLayers';

describe('useEvidenceLayers', () => {
    it('sharpness and noise are mutually exclusive', () => {
        const { result } = renderHook(() =>
            useEvidenceLayers({
                region: true,
                mask: true,
                keypoints: true,
                focus_grid: true,
                noise_grid: true,
            }),
        );
        act(() => result.current.setLayer('sharpness', true));
        expect(result.current.layers.sharpness).toBe(true);
        act(() => result.current.setLayer('noise', true));
        expect(result.current.layers.noise).toBe(true);
        expect(result.current.layers.sharpness).toBe(false);
    });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NARROW_LAYOUT_QUERY, useResponsiveSidebar } from './useResponsiveSidebar';

function mockMatchMedia(initiallyNarrow: boolean) {
    let narrow = initiallyNarrow;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
        get matches() { return query === NARROW_LAYOUT_QUERY && narrow; },
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }));
    return {
        setNarrow(value: boolean) {
            narrow = value;
            listeners.forEach((cb) => cb());
        },
    };
}

describe('useResponsiveSidebar (#226)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('starts open on a wide window and toggles', () => {
        mockMatchMedia(false);
        const { result } = renderHook(() => useResponsiveSidebar());
        expect(result.current.sidebarOpen).toBe(true);
        act(() => result.current.toggleSidebar());
        expect(result.current.sidebarOpen).toBe(false);
        act(() => result.current.toggleSidebar());
        expect(result.current.sidebarOpen).toBe(true);
    });

    it('starts closed on a narrow window', () => {
        mockMatchMedia(true);
        const { result } = renderHook(() => useResponsiveSidebar());
        expect(result.current.sidebarOpen).toBe(false);
    });

    it('closes when the window becomes narrow', () => {
        const media = mockMatchMedia(false);
        const { result } = renderHook(() => useResponsiveSidebar());
        act(() => media.setNarrow(true));
        expect(result.current.sidebarOpen).toBe(false);
    });

    it('closeSidebar closes it', () => {
        mockMatchMedia(false);
        const { result } = renderHook(() => useResponsiveSidebar());
        act(() => result.current.closeSidebar());
        expect(result.current.sidebarOpen).toBe(false);
    });
});

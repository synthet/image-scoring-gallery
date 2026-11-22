import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageUrlSync } from './useImageUrlSync';

function setup(initialId: number | null, openImageById = vi.fn().mockResolvedValue(true)) {
    const closeViewer = vi.fn();
    const hook = renderHook(
        ({ id }: { id: number | null }) => useImageUrlSync({ openImageId: id, openImageById, closeViewer, enabled: true }),
        { initialProps: { id: initialId } },
    );
    return { ...hook, openImageById, closeViewer };
}

const param = () => new URL(window.location.href).searchParams.get('image');

describe('useImageUrlSync (#289)', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('adds ?image=<id> with a new history entry when a picture opens', () => {
        const push = vi.spyOn(window.history, 'pushState');
        const { rerender } = setup(null);
        rerender({ id: 42 });
        expect(param()).toBe('42');
        expect(push).toHaveBeenCalledTimes(1);
    });

    it('replaces the entry when the viewer moves to another picture', () => {
        const { rerender } = setup(null);
        rerender({ id: 42 });
        const push = vi.spyOn(window.history, 'pushState');
        rerender({ id: 43 });
        expect(param()).toBe('43');
        expect(push).not.toHaveBeenCalled();
    });

    it('goes back one entry when the viewer is closed in the app', () => {
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        const { rerender } = setup(null);
        rerender({ id: 42 });
        rerender({ id: null });
        expect(back).toHaveBeenCalledTimes(1);
    });

    it('closes the viewer when Back removes the picture from the URL', () => {
        const { rerender, closeViewer } = setup(null);
        rerender({ id: 42 });
        act(() => {
            window.history.replaceState(null, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(closeViewer).toHaveBeenCalledTimes(1);
    });

    it('opens the picture named by ?image= on load and keeps the parameter while it loads', () => {
        window.history.replaceState(null, '', '/?image=7');
        const { openImageById } = setup(null);
        expect(openImageById).toHaveBeenCalledWith(7);
        expect(param()).toBe('7');
    });

    it('drops ?image= when that picture cannot be opened', async () => {
        window.history.replaceState(null, '', '/?image=7');
        setup(null, vi.fn().mockResolvedValue(false));
        await act(async () => {});
        expect(param()).toBeNull();
    });

    it('ignores a malformed ?image= value', () => {
        window.history.replaceState(null, '', '/?image=abc');
        const { openImageById } = setup(null);
        expect(openImageById).not.toHaveBeenCalled();
    });

    it('does nothing when disabled (desktop app)', () => {
        const push = vi.spyOn(window.history, 'pushState');
        const openImageById = vi.fn();
        window.history.replaceState(null, '', '/?image=7');
        const { rerender } = renderHook(
            ({ id }: { id: number | null }) => useImageUrlSync({ openImageId: id, openImageById, closeViewer: vi.fn(), enabled: false }),
            { initialProps: { id: null as number | null } },
        );
        rerender({ id: 42 });
        expect(openImageById).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
    });
});

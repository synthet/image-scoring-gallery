import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardLayer } from './useKeyboardLayer';

describe('useKeyboardLayer', () => {
  it('invokes handler when keydown is dispatched', () => {
    const handler = vi.fn().mockReturnValue(false);
    const { unmount } = renderHook(() => useKeyboardLayer('page', handler, true));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledWith(event);
    unmount();
  });

  it('modal handler receives event before page handler when both active', () => {
    const order: string[] = [];
    const modalHandler = vi.fn().mockImplementation(() => {
      order.push('modal');
      return false;
    });
    const pageHandler = vi.fn().mockImplementation(() => {
      order.push('page');
      return false;
    });

    const { unmount: unmountModal } = renderHook(() =>
      useKeyboardLayer('modal', modalHandler, true)
    );
    const { unmount: unmountPage } = renderHook(() =>
      useKeyboardLayer('page', pageHandler, true)
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(order).toEqual(['modal', 'page']);
    unmountModal();
    unmountPage();
  });

  it('when handler returns true, lower-priority handlers are not called', () => {
    const modalHandler = vi.fn().mockReturnValue(true);
    const pageHandler = vi.fn().mockReturnValue(false);

    const { unmount: unmountModal } = renderHook(() =>
      useKeyboardLayer('modal', modalHandler, true)
    );
    const { unmount: unmountPage } = renderHook(() =>
      useKeyboardLayer('page', pageHandler, true)
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(modalHandler).toHaveBeenCalled();
    expect(pageHandler).not.toHaveBeenCalled();
    unmountModal();
    unmountPage();
  });

  it('when active=false, handler is not invoked', () => {
    const handler = vi.fn().mockReturnValue(false);
    const { unmount } = renderHook(() => useKeyboardLayer('page', handler, false));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it('unmount removes handler from active set', () => {
    const handler = vi.fn().mockReturnValue(false);
    const { unmount } = renderHook(() => useKeyboardLayer('page', handler, true));

    unmount();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).not.toHaveBeenCalled();
  });
});

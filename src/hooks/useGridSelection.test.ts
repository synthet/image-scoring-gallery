import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectAll } from '../utils/gridSelection';
import { useGridSelection } from './useGridSelection';

describe('useGridSelection (#239)', () => {
    it('keeps the selection while the view stays the same, and clears on request', () => {
        const { result, rerender } = renderHook(({ scope }) => useGridSelection(scope), { initialProps: { scope: 'a' } });
        act(() => result.current[1](selectAll()));
        rerender({ scope: 'a' });
        expect(result.current[0].all).toBe(true);

        act(() => result.current[2]());
        expect(result.current[0]).toBe(EMPTY_SELECTION);
    });

    it('drops the selection in the same render the view changes, and does not bring it back', () => {
        const { result, rerender } = renderHook(({ scope }) => useGridSelection(scope), { initialProps: { scope: 'a' } });
        act(() => result.current[1](selectAll()));

        rerender({ scope: 'b' });
        expect(result.current[0]).toBe(EMPTY_SELECTION);

        rerender({ scope: 'a' });
        expect(result.current[0]).toBe(EMPTY_SELECTION);
    });
});

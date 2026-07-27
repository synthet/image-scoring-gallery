import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSyncRef } from './useSyncRef';

describe('useSyncRef', () => {
    it('returns a ref object', () => {
        const { result, rerender } = renderHook(({ value }) => useSyncRef(value), {
            initialProps: { value: 'a' },
        });
        expect(result.current).toHaveProperty('current');
        rerender({ value: 'b' });
        expect(result.current.current).toBe('b');
    });
});

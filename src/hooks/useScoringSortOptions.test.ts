import { describe, expect, it } from 'vitest';
import { useScoringSortOptions, isSortOptionValue } from './useScoringSortOptions';

describe('useScoringSortOptions helpers', () => {
    it('isSortOptionValue matches known option values', () => {
        const options = [
            { value: 'score_general', label: 'General Score', group: 'composite' as const },
            { value: 'model:topiq', label: 'TOPIQ-NR', group: 'model' as const },
        ];
        expect(isSortOptionValue('model:topiq', options)).toBe(true);
        expect(isSortOptionValue('score_koniq', options)).toBe(false);
        expect(isSortOptionValue(undefined, options)).toBe(false);
    });
});

describe('useScoringSortOptions', () => {
    it('exports hook function', () => {
        expect(typeof useScoringSortOptions).toBe('function');
    });
});

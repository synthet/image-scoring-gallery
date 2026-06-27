import { describe, expect, it } from 'vitest';
import {
    BIRDS_SPECIES_EXHAUSTED_KEYWORD,
    formatSpeciesLabel,
    getEffectiveKeyword,
    partitionKeywords,
    toImageQueryFilters,
} from './keywordFilters';
import type { FilterState } from '../components/Sidebar/FilterPanel';

const baseFilters: FilterState = {
    minRating: 0,
    sortBy: 'capture_date',
    order: 'DESC',
};

describe('partitionKeywords', () => {
    it('hides exhausted marker and splits species keywords', () => {
        const input = [
            'birds',
            BIRDS_SPECIES_EXHAUSTED_KEYWORD,
            'species:American Robin',
            'landscape',
        ];
        expect(partitionKeywords(input)).toEqual({
            generalKeywords: ['birds', 'landscape'],
            speciesKeywords: ['species:American Robin'],
        });
    });
});

describe('getEffectiveKeyword', () => {
    it('uses species sub-filter when birds is selected', () => {
        expect(getEffectiveKeyword({
            ...baseFilters,
            keyword: 'birds',
            speciesKeyword: 'species:House Sparrow',
        })).toBe('species:House Sparrow');
    });

    it('falls back to birds when no species selected', () => {
        expect(getEffectiveKeyword({ ...baseFilters, keyword: 'birds' })).toBe('birds');
    });

    it('passes through non-bird keywords unchanged', () => {
        expect(getEffectiveKeyword({ ...baseFilters, keyword: 'landscape' })).toBe('landscape');
    });
});

describe('formatSpeciesLabel', () => {
    it('strips species prefix for display', () => {
        expect(formatSpeciesLabel('species:American Robin')).toBe('American Robin');
    });
});

describe('toImageQueryFilters', () => {
  it('omits UI-only speciesKeyword from query payload', () => {
    const result = toImageQueryFilters({
      ...baseFilters,
      keyword: 'birds',
      speciesKeyword: 'species:Cardinal',
      minRating: 3,
    });
    expect(result).toEqual({
      minRating: 3,
      colorLabel: undefined,
      sortBy: 'capture_date',
      order: 'DESC',
      capturedDate: undefined,
      keyword: 'species:Cardinal',
    });
    expect(result).not.toHaveProperty('speciesKeyword');
  });

  it('does not expose minClipQualityV0 (sidebar filter removed)', () => {
    const result = toImageQueryFilters(baseFilters);
    expect(result).not.toHaveProperty('minClipQualityV0');
  });
});

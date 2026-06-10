import type { FilterState } from '../components/Sidebar/FilterPanel';

/** System marker written when BioCLIP finds no species above threshold. */
export const BIRDS_SPECIES_EXHAUSTED_KEYWORD = 'birds:species-exhausted';

const SPECIES_PREFIX = 'species:';

function isSpeciesKeyword(keyword: string): boolean {
    return keyword.toLowerCase().startsWith(SPECIES_PREFIX);
}

export function formatSpeciesLabel(speciesKeyword: string): string {
    return isSpeciesKeyword(speciesKeyword)
        ? speciesKeyword.slice(SPECIES_PREFIX.length)
        : speciesKeyword;
}

export function partitionKeywords(keywords: string[]): {
    speciesKeywords: string[];
    generalKeywords: string[];
} {
    const speciesKeywords: string[] = [];
    const generalKeywords: string[] = [];

    for (const kw of keywords) {
        if (kw === BIRDS_SPECIES_EXHAUSTED_KEYWORD) continue;
        if (isSpeciesKeyword(kw)) {
            speciesKeywords.push(kw);
        } else {
            generalKeywords.push(kw);
        }
    }

    return { speciesKeywords, generalKeywords };
}

/** Keyword sent to DB / API queries (species sub-filter overrides `birds`). */
export function getEffectiveKeyword(filters: FilterState): string | undefined {
    if (filters.keyword === 'birds' && filters.speciesKeyword) {
        return filters.speciesKeyword;
    }
    return filters.keyword;
}

/** FilterState fields mapped to image/stack query options (excludes UI-only speciesKeyword). */
export function toImageQueryFilters(filters: FilterState) {
    return {
        minRating: filters.minRating,
        colorLabel: filters.colorLabel,
        sortBy: filters.sortBy,
        order: filters.order,
        capturedDate: filters.capturedDate,
        keyword: getEffectiveKeyword(filters),
    };
}

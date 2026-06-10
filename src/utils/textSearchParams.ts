import type { TextSearchParams } from '../../electron/apiTypes';
import type { FilterState } from '../components/Sidebar/FilterPanel';
import { getEffectiveKeyword } from './keywordFilters';

const TEXT_SEARCH_SORT_ALLOWLIST = new Set([
    'capture_date',
    'created_at',
    'rating',
    'score_general',
    'score_technical',
    'score_aesthetic',
    'id',
]);

export interface TextSearchScope {
    folderPath?: string;
    folderIds?: number[];
}

export function buildTextSearchParams(
    query: string,
    scope: TextSearchScope,
    filters: FilterState,
    options: { limit?: number; min_similarity?: number },
): TextSearchParams {
    const sortKey = filters.sortBy?.trim();
    const useSecondarySort = sortKey && TEXT_SEARCH_SORT_ALLOWLIST.has(sortKey);

    const params: TextSearchParams = {
        query: query.trim(),
        limit: options.limit,
        min_similarity: options.min_similarity,
        min_rating: filters.minRating > 0 ? filters.minRating : undefined,
        color_label: filters.colorLabel,
        keyword: getEffectiveKeyword(filters)?.trim() || undefined,
        captured_date: filters.capturedDate?.trim() || undefined,
    };

    if (scope.folderIds?.length) {
        params.folder_ids = scope.folderIds;
    } else if (scope.folderPath) {
        params.folder_path = scope.folderPath;
    }

    if (useSecondarySort && sortKey) {
        params.sort_by = sortKey;
        params.order = filters.order ?? 'DESC';
    }

    return params;
}

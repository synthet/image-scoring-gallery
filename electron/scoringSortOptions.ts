import { modelSortKey } from './sortColumns';

export interface SortOption {
    value: string;
    label: string;
    group: 'composite' | 'meta' | 'model';
}

export const STATIC_SORT_OPTIONS: SortOption[] = [
    { value: 'score_general', label: 'General Score', group: 'composite' },
    { value: 'score_technical', label: 'Technical Score', group: 'composite' },
    { value: 'score_aesthetic', label: 'Aesthetic Score', group: 'composite' },
    { value: 'capture_date', label: 'Capture Date', group: 'meta' },
    { value: 'id', label: 'ID', group: 'meta' },
];

/** Fallback when API and config are unavailable. */
export const FALLBACK_MODEL_SORT_OPTIONS: SortOption[] = [
    ...STATIC_SORT_OPTIONS,
    { value: modelSortKey('spaq'), label: 'SPAQ', group: 'model' },
    { value: modelSortKey('ava'), label: 'AVA', group: 'model' },
    { value: modelSortKey('liqe'), label: 'LIQE', group: 'model' },
];

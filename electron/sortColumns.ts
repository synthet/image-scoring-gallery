/** Shared sort-key parsing and SQL helpers for gallery queries. */

export const LEGACY_MODEL_SORT_KEYS = new Set([
    'score_spaq',
    'score_ava',
    'score_liqe',
    'score_koniq',
    'score_paq2piq',
]);

export const META_SORT_KEYS = new Set([
    'id',
    'created_at',
    'capture_date',
    'rating',
    'file_name',
]);

export const COMPOSITE_SORT_KEYS = new Set([
    'score_general',
    'score_technical',
    'score_aesthetic',
]);

const MODEL_SORT_PREFIX = 'model:';

const MODEL_NAME_RE = /^[a-z0-9_]+$/i;

export function isValidModelName(name: string): boolean {
    return MODEL_NAME_RE.test(name);
}

export function modelSortKey(name: string): string {
    return `${MODEL_SORT_PREFIX}${name}`;
}

export function parseModelSortKey(sortKey: string): string | null {
    if (!sortKey.startsWith(MODEL_SORT_PREFIX)) return null;
    const name = sortKey.slice(MODEL_SORT_PREFIX.length);
    return isValidModelName(name) ? name : null;
}

export type ParsedSortKey =
    | { kind: 'meta'; key: string }
    | { kind: 'composite'; key: string }
    | { kind: 'legacy'; key: string }
    | { kind: 'model'; modelName: string };

export function parseSortKey(sortBy: string | undefined, fallback = 'score_general'): ParsedSortKey {
    const raw = sortBy?.trim() || fallback;
    const modelName = parseModelSortKey(raw);
    if (modelName) return { kind: 'model', modelName };
    if (META_SORT_KEYS.has(raw)) return { kind: 'meta', key: raw };
    if (COMPOSITE_SORT_KEYS.has(raw)) return { kind: 'composite', key: raw };
    if (LEGACY_MODEL_SORT_KEYS.has(raw)) return { kind: 'legacy', key: raw };
    return { kind: 'composite', key: fallback };
}

export function isAllowedSortKey(sortBy: string | undefined): boolean {
    if (!sortBy) return false;
    if (parseModelSortKey(sortBy)) return true;
    return (
        META_SORT_KEYS.has(sortBy)
        || COMPOSITE_SORT_KEYS.has(sortBy)
        || LEGACY_MODEL_SORT_KEYS.has(sortBy)
    );
}

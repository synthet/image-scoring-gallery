/** Shared sort-key parsing and SQL helpers for gallery queries. */

/**
 * Sort keys that were historically dedicated columns on ``images``. They are
 * kept as parser aliases so saved UI state and external links keep working;
 * internally they redirect to the ``model:<name>`` path that joins
 * ``image_model_scores`` (the per-model table from backend migration 0016).
 */
export const LEGACY_MODEL_SORT_KEYS = new Set([
    'score_spaq',
    'score_ava',
    'score_liqe',
    'score_koniq',
    'score_paq2piq',
]);

/** Map a ``score_<name>`` legacy sort key to its model name, or null. */
export function legacySortKeyToModel(sortKey: string): string | null {
    if (!LEGACY_MODEL_SORT_KEYS.has(sortKey)) return null;
    return sortKey.slice('score_'.length);
}

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

/** Models withheld from the gallery sort UI (see ``electron/scoringModels``). */
const SORT_EXCLUDED_MODEL_NAMES = new Set(['qpt_v2']);

export function parseModelSortKey(sortKey: string): string | null {
    if (!sortKey.startsWith(MODEL_SORT_PREFIX)) return null;
    const name = sortKey.slice(MODEL_SORT_PREFIX.length);
    if (!isValidModelName(name) || SORT_EXCLUDED_MODEL_NAMES.has(name)) return null;
    return name;
}

export type ParsedSortKey =
    | { kind: 'meta'; key: string }
    | { kind: 'composite'; key: string }
    | { kind: 'model'; modelName: string };

export function parseSortKey(sortBy: string | undefined, fallback = 'score_general'): ParsedSortKey {
    const raw = sortBy?.trim() || fallback;
    const modelName = parseModelSortKey(raw);
    if (modelName) return { kind: 'model', modelName };
    if (META_SORT_KEYS.has(raw)) return { kind: 'meta', key: raw };
    if (COMPOSITE_SORT_KEYS.has(raw)) return { kind: 'composite', key: raw };
    const legacyModel = legacySortKeyToModel(raw);
    if (legacyModel) return { kind: 'model', modelName: legacyModel };
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

export function canonicalizeSortKey(sortBy: string | undefined): string | undefined {
    if (!sortBy) return sortBy;
    const legacyModel = legacySortKeyToModel(sortBy);
    return legacyModel ? `model:${legacyModel}` : sortBy;
}

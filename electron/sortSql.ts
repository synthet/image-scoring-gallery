import { parseSortKey, type ParsedSortKey } from './sortColumns';

export interface SortSqlParts {
    parsed: ParsedSortKey;
    /** Extra JOIN clauses (before WHERE). Empty for legacy/meta/composite. */
    joinSql: string;
    /** ORDER BY expression (without direction). */
    orderExpr: string;
    /** Bound params for joinSql placeholders (model name). */
    joinParams: string[];
    /** Extra SELECT columns for model sort overlay. */
    selectExtra: string;
    modelNameForOverlay: string | null;
}

const IMS_ALIAS = 'ims_sort';

export function buildImageSortSql(sortBy: string | undefined, fallback = 'score_general'): SortSqlParts {
    const parsed = parseSortKey(sortBy, fallback);

    if (parsed.kind === 'model') {
        return {
            parsed,
            joinSql: `LEFT JOIN image_model_scores ${IMS_ALIAS} ON i.id = ${IMS_ALIAS}.image_id AND ${IMS_ALIAS}.model_name = ?`,
            orderExpr: `${IMS_ALIAS}.normalized`,
            joinParams: [parsed.modelName],
            selectExtra: `${IMS_ALIAS}.normalized AS model_sort_score`,
            modelNameForOverlay: parsed.modelName,
        };
    }

    if (parsed.kind === 'meta' && parsed.key === 'capture_date') {
        return {
            parsed,
            joinSql: '',
            orderExpr: '', // caller supplies CAPTURE_TS
            joinParams: [],
            selectExtra: '',
            modelNameForOverlay: null,
        };
    }

    const column = parsed.kind === 'meta' || parsed.kind === 'legacy' || parsed.kind === 'composite'
        ? parsed.key
        : fallback;

    return {
        parsed,
        joinSql: '',
        orderExpr: `i.${column}`,
        joinParams: [],
        selectExtra: '',
        modelNameForOverlay: null,
    };
}

/** Stack sort: aggregate member model scores for stacked rows; direct join for singletons. */
export function buildStackSortExpressions(
    sortBy: string | undefined,
    sortOrder: 'ASC' | 'DESC',
    captureTsExpr: string,
    fallback = 'score_general',
): {
    parsed: ParsedSortKey;
    cacheSortCol: string;
    nonStackSortCol: string;
    joinSqlNonStack: string;
    joinParams: string[];
    selectExtraNonStack: string;
    modelNameForOverlay: string | null;
} {
    const parsed = parseSortKey(sortBy, fallback);
    const desc = sortOrder === 'DESC';

    if (parsed.kind === 'model') {
        const aggFn = desc ? 'MAX' : 'MIN';
        const cacheSortCol = `(
            SELECT ${aggFn}(${IMS_ALIAS}.normalized)
            FROM images ci
            JOIN image_model_scores ${IMS_ALIAS} ON ci.id = ${IMS_ALIAS}.image_id AND ${IMS_ALIAS}.model_name = '${parsed.modelName}'
            WHERE ci.stack_id = sc.stack_id
        )`;
        const nonStackSortCol = `${IMS_ALIAS}.normalized`;
        const joinSqlNonStack = `LEFT JOIN image_model_scores ${IMS_ALIAS} ON i.id = ${IMS_ALIAS}.image_id AND ${IMS_ALIAS}.model_name = '${parsed.modelName}'`;
        return {
            parsed,
            cacheSortCol,
            nonStackSortCol,
            joinSqlNonStack,
            joinParams: [],
            selectExtraNonStack: `${IMS_ALIAS}.normalized AS model_sort_score`,
            modelNameForOverlay: parsed.modelName,
        };
    }

    const key = parsed.kind === 'meta' || parsed.kind === 'legacy' || parsed.kind === 'composite'
        ? parsed.key
        : fallback;

    if (parsed.kind === 'meta' && key === 'capture_date') {
        return {
            parsed,
            cacheSortCol: captureTsExpr,
            nonStackSortCol: captureTsExpr,
            joinSqlNonStack: '',
            joinParams: [],
            selectExtraNonStack: '',
            modelNameForOverlay: null,
        };
    }

    const cacheColMap: Record<string, string> = {
        score_general: desc ? 'sc.max_score_general' : 'sc.min_score_general',
        score_technical: desc ? 'sc.max_score_technical' : 'sc.min_score_technical',
        score_aesthetic: desc ? 'sc.max_score_aesthetic' : 'sc.min_score_aesthetic',
        score_spaq: desc ? 'sc.max_score_spaq' : 'sc.min_score_spaq',
        score_ava: desc ? 'sc.max_score_ava' : 'sc.min_score_ava',
        score_liqe: desc ? 'sc.max_score_liqe' : 'sc.min_score_liqe',
        rating: desc ? 'sc.max_rating' : 'sc.min_rating',
        created_at: desc ? 'sc.max_created_at' : 'sc.min_created_at',
        file_name: 'i.file_name',
        id: 'sc.rep_image_id',
    };

    const cacheSortCol = cacheColMap[key] ?? (desc ? 'sc.max_score_general' : 'sc.min_score_general');
    const nonStackSortCol = `i.${key}`;

    return {
        parsed,
        cacheSortCol,
        nonStackSortCol,
        joinSqlNonStack: '',
        joinParams: [],
        selectExtraNonStack: '',
        modelNameForOverlay: null,
    };
}

export function attachModelSortOverlay(
    row: Record<string, unknown>,
    modelName: string | null,
): void {
    if (!modelName) return;
    const score = row.model_sort_score;
    if (score === null || score === undefined) return;
    const num = typeof score === 'number' ? score : Number(score);
    if (!Number.isFinite(num)) return;
    const existing = row.model_scores;
    const modelScores = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, number>) }
        : {};
    modelScores[modelName] = num;
    row.model_scores = modelScores;
    delete row.model_sort_score;
}

export function attachModelSortOverlays(
    rows: unknown[],
    modelName: string | null,
): void {
    if (!modelName) return;
    for (const r of rows) {
        if (r && typeof r === 'object') {
            attachModelSortOverlay(r as Record<string, unknown>, modelName);
        }
    }
}

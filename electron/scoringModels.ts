import fs from 'fs';
import path from 'path';
import type { ApiService } from './apiService';
import {
    LEGACY_MODEL_SORT_KEYS,
    modelSortKey,
} from './sortColumns';

export interface ScoringModelApiEntry {
    name: string;
    enabled: boolean;
    shadow: boolean;
}

export interface ScoringModelsApiResponse {
    models: ScoringModelApiEntry[];
    count: number;
}

export interface ScoringModelInfo {
    name: string;
    label: string;
    sortKey: string;
    source: 'legacy' | 'model_scores';
    isShadow: boolean;
}

export interface SortOption {
    value: string;
    label: string;
    group: 'composite' | 'meta' | 'model';
}

/** Registered model names when config does not list them (matches backend registry defaults). */
export const REGISTERED_MODEL_NAMES = [
    'spaq',
    'ava',
    'liqe',
    'topiq',
    'cursor',
    'claude',
] as const;

const SCORE_LABELS: Record<string, string> = {
    topiq: 'TOPIQ-NR',
    cursor: 'Cursor (LLM)',
    claude: 'Claude (LLM)',
    liqe: 'LIQE',
    spaq: 'SPAQ',
    ava: 'AVA',
    paq2piq: 'PAQ2PIQ',
    koniq: 'KonIQ',
    general: 'General Score',
    technical: 'Technical Score',
    aesthetic: 'Aesthetic Score',
};

const STATIC_SORT_OPTIONS: SortOption[] = [
    { value: 'score_general', label: 'General Score', group: 'composite' },
    { value: 'score_technical', label: 'Technical Score', group: 'composite' },
    { value: 'score_aesthetic', label: 'Aesthetic Score', group: 'composite' },
    { value: 'capture_date', label: 'Capture Date', group: 'meta' },
    { value: 'id', label: 'ID', group: 'meta' },
];

/** Fallback when API and config are unavailable. */
export const FALLBACK_MODEL_SORT_OPTIONS: SortOption[] = [
    ...STATIC_SORT_OPTIONS,
    { value: 'score_spaq', label: 'SPAQ', group: 'model' },
    { value: 'score_ava', label: 'AVA', group: 'model' },
    { value: 'score_liqe', label: 'LIQE', group: 'model' },
];

type ModelMembership = { enabled?: boolean; shadow?: boolean };

function modelLabel(name: string, isShadow: boolean): string {
    const base = SCORE_LABELS[name] ?? name.toUpperCase();
    return isShadow ? `${base} (shadow)` : base;
}

function legacySortKeyForModel(name: string): string | null {
    const key = `score_${name}`;
    return LEGACY_MODEL_SORT_KEYS.has(key) ? key : null;
}

/** Production models only (enabled, not shadow) — matches backend registry. */
function isProductionApiModel(m: ScoringModelApiEntry): boolean {
    return m.enabled && !m.shadow;
}

function isProductionMembership(membership: ModelMembership | undefined): boolean {
    if (!membership) return true;
    if (membership.shadow === true) return false;
    return membership.enabled !== false;
}

export function buildModelInfosFromApi(models: ScoringModelApiEntry[]): ScoringModelInfo[] {
    return models
        .filter(isProductionApiModel)
        .map((m) => {
            const legacyKey = legacySortKeyForModel(m.name);
            return {
                name: m.name,
                label: modelLabel(m.name, false),
                sortKey: legacyKey ?? modelSortKey(m.name),
                source: legacyKey ? 'legacy' : 'model_scores',
                isShadow: false,
            } satisfies ScoringModelInfo;
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildModelInfosFromConfig(
    scoringModels: Record<string, ModelMembership>,
): ScoringModelInfo[] {
    const names = new Set<string>(REGISTERED_MODEL_NAMES);
    for (const name of Object.keys(scoringModels)) {
        names.add(name);
    }

    const infos: ScoringModelInfo[] = [];
    for (const name of names) {
        const membership = scoringModels[name];
        if (!isProductionMembership(membership)) continue;
        const legacyKey = legacySortKeyForModel(name);
        infos.push({
            name,
            label: modelLabel(name, false),
            sortKey: legacyKey ?? modelSortKey(name),
            source: legacyKey ? 'legacy' : 'model_scores',
            isShadow: false,
        });
    }
    return infos.sort((a, b) => a.label.localeCompare(b.label));
}

export function buildSortOptions(modelInfos: ScoringModelInfo[]): SortOption[] {
    return [
        ...STATIC_SORT_OPTIONS,
        ...modelInfos.map((m) => ({
            value: m.sortKey,
            label: m.label,
            group: 'model' as const,
        })),
    ];
}

/** Union by model name; config/registry list wins over API for duplicates. */
export function mergeProductionModelInfos(
    fromConfig: ScoringModelInfo[],
    fromApi: ScoringModelInfo[],
): ScoringModelInfo[] {
    const byName = new Map<string, ScoringModelInfo>();
    for (const m of fromConfig) byName.set(m.name, m);
    for (const m of fromApi) {
        if (!byName.has(m.name)) byName.set(m.name, m);
    }
    return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function readBackendConfigScoringModels(projectRoot: string): Record<string, ModelMembership> | null {
    try {
        const configPath = path.resolve(projectRoot, '..', 'image-scoring-backend', 'config.json');
        if (!fs.existsSync(configPath)) return null;
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
            scoring?: { models?: Record<string, ModelMembership> };
        };
        return raw.scoring?.models ?? {};
    } catch {
        return null;
    }
}

export async function resolveSortOptions(
    apiService: ApiService,
    projectRoot: string,
): Promise<SortOption[]> {
    const configSection = readBackendConfigScoringModels(projectRoot) ?? {};
    const fromConfig = buildModelInfosFromConfig(configSection);

    let fromApi: ScoringModelInfo[] = [];
    try {
        if (await apiService.isAvailable()) {
            const response = await apiService.getScoringModels();
            fromApi = buildModelInfosFromApi(response.models.filter(isProductionApiModel));
        }
    } catch {
        // API optional; config/registry defaults still apply
    }

    const merged = mergeProductionModelInfos(fromConfig, fromApi);
    if (merged.length > 0) {
        return buildSortOptions(merged);
    }

    return [...FALLBACK_MODEL_SORT_OPTIONS];
}

export function isSortKeyInOptions(sortBy: string | undefined, options: SortOption[]): boolean {
    if (!sortBy) return false;
    return options.some((o) => o.value === sortBy);
}

export function normalizeSortBy(
    sortBy: string | undefined,
    options: SortOption[],
    fallback = 'score_general',
): string {
    if (sortBy && isSortKeyInOptions(sortBy, options)) return sortBy;
    return fallback;
}

/**
 * Canonical pipeline stage codes — keep in sync with
 * image-scoring-backend `modules/phases.py` (`UiStageCode`) and
 * `frontend/src/types/api.ts` (`UiStageCode` / `StageCode`).
 */
export const UiStageCode = {
    INDEXING: 'indexing',
    METADATA: 'metadata',
    SCORING: 'scoring',
    CULLING: 'culling',
    KEYWORDS: 'keywords',
    BIRD_SPECIES: 'bird_species',
} as const;

export type StageCode = (typeof UiStageCode)[keyof typeof UiStageCode];

/** Lowercase/trim; replace `-` with `_` so hyphenated keys match canonical codes. */
export function normalizeUiStageInput(raw: string | null | undefined): string {
    return (raw ?? '').trim().toLowerCase().replace(/-/g, '_');
}

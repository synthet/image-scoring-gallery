import { STAGE_DISPLAY as SHARED_STAGE_DISPLAY } from '@synthet/image-scoring-design';
import { UiStageCode, type StageCode } from '../types/pipelineStage';

/**
 * User-facing pipeline stage names — sourced from @synthet/image-scoring-design
 * (aligns with image-scoring-backend `frontend/src/types/api.ts`).
 */
export const STAGE_DISPLAY: Pick<typeof SHARED_STAGE_DISPLAY, StageCode> = {
    [UiStageCode.INDEXING]: SHARED_STAGE_DISPLAY.indexing,
    [UiStageCode.METADATA]: SHARED_STAGE_DISPLAY.metadata,
    [UiStageCode.SCORING]: SHARED_STAGE_DISPLAY.scoring,
    [UiStageCode.CULLING]: SHARED_STAGE_DISPLAY.culling,
    [UiStageCode.KEYWORDS]: SHARED_STAGE_DISPLAY.keywords,
    [UiStageCode.BIRD_SPECIES]: SHARED_STAGE_DISPLAY.bird_species,
};

/** Keys sent as `stage_codes` in POST /api/pipeline/submit */
export type PipelineOperation = 'indexing' | 'metadata' | 'score' | 'tag' | 'cluster';

/** Maps submit API operation tokens to the same display names as STAGE_DISPLAY. */
export const PIPELINE_OPERATION_LABEL: Record<PipelineOperation, string> = {
    indexing: STAGE_DISPLAY.indexing.name,
    metadata: STAGE_DISPLAY.metadata.name,
    score: STAGE_DISPLAY.scoring.name,
    tag: STAGE_DISPLAY.keywords.name,
    cluster: STAGE_DISPLAY.culling.name,
};

export const PIPELINE_OPERATION_ORDER: readonly PipelineOperation[] = [
    'indexing',
    'metadata',
    'score',
    'tag',
    'cluster',
];

/**
 * Labels for `job_type` strings from the backend WebSocket / jobs API.
 * Pipeline-related values align with `STAGE_DISPLAY` in the backend Vite app.
 */
export const BACKEND_JOB_TYPE_LABEL: Record<string, string> = {
    scoring: STAGE_DISPLAY.scoring.name,
    tagging: STAGE_DISPLAY.keywords.name,
    clustering: STAGE_DISPLAY.culling.name,
    selection: 'Selection',
    fix_db: 'Fix DB',
    indexing: STAGE_DISPLAY.indexing.name,
    metadata: STAGE_DISPLAY.metadata.name,
    [UiStageCode.BIRD_SPECIES]: 'Bird Species ID',
    pipeline: 'Pipeline',
};

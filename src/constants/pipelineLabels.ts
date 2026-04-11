import { UiStageCode, type StageCode } from '../types/pipelineStage';

/**
 * User-facing pipeline stage names — keep in sync with
 * image-scoring-backend `frontend/src/types/api.ts` (`STAGE_DISPLAY`).
 */
export const STAGE_DISPLAY: Record<StageCode, { name: string; description: string }> = {
    [UiStageCode.INDEXING]: { name: 'Discovery', description: 'Scan and register image files' },
    [UiStageCode.METADATA]: { name: 'Inspection', description: 'Extract EXIF metadata and generate thumbnails' },
    [UiStageCode.SCORING]: { name: 'Quality Analysis', description: 'AI-powered quality scoring (MUSIQ, LIQE, TOPIQ, Q-Align)' },
    [UiStageCode.CULLING]: { name: 'Similarity Clustering', description: 'Group similar images into stacks' },
    [UiStageCode.KEYWORDS]: { name: 'Tagging', description: 'Generate keywords and captions via BLIP/CLIP' },
    [UiStageCode.BIRD_SPECIES]: { name: 'Bird Species ID', description: 'Identify bird species with BioCLIP 2 (run after Tagging)' },
};

/** Keys sent as `operations` / `stage_codes` in POST /api/pipeline/submit */
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

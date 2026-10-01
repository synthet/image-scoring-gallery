/** Mirrors backend `EvidencePayload` (visual evidence API). */

export type EvidenceCriterion =
    | 'focus'
    | 'eye'
    | 'exposure'
    | 'composition'
    | 'noise'
    | 'context';

export type EvidenceLimitation =
    | 'no_region'
    | 'mask_low_confidence'
    | 'keypoints_heuristic'
    | 'small_subject_second_pass';

export interface EvidenceGrid {
    cells_x: number;
    cells_y: number;
    cell_size_px: number;
    values: number[];
    values_normalized?: number[] | null;
}

export interface EvidenceMaskRle {
    width: number;
    height: number;
    counts: number[];
    max_dim?: number;
}

export interface EvidenceDisplayGates {
    region: boolean;
    mask: boolean;
    keypoints: boolean;
    focus_grid: boolean;
    noise_grid: boolean;
}

export interface EvidenceSeparation {
    subject_sharpness_mean?: number | null;
    background_sharpness_mean?: number | null;
    ratio?: number | null;
    noise_sigma_mean?: number | null;
    mask_label?: string;
}

export interface CriterionBand {
    criterion: EvidenceCriterion;
    band: string;
    sub_score?: number | null;
    confidence_evidence?: number | null;
}

export interface ImageEvidencePayload {
    evidence_schema_version: number;
    extractor_version: string;
    image_id: number;
    display_width: number;
    display_height: number;
    rendition_hash?: string | null;
    gates: EvidenceDisplayGates;
    limitations: EvidenceLimitation[];
    criteria: CriterionBand[];
    focus_grid?: EvidenceGrid | null;
    noise_grid?: EvidenceGrid | null;
    mask_rle?: EvidenceMaskRle | null;
    separation?: EvidenceSeparation | null;
    region_bbox?: Record<string, unknown> | null;
    keypoints?: Record<string, unknown>[] | null;
    burst?: Record<string, unknown> | null;
}

export type EvidenceLayerId = 'region' | 'mask' | 'keypoints' | 'sharpness' | 'noise';

export interface EvidenceLayerState {
    region: boolean;
    mask: boolean;
    keypoints: boolean;
    sharpness: boolean;
    noise: boolean;
}

export const DEFAULT_EVIDENCE_LAYERS: EvidenceLayerState = {
    region: false,
    mask: false,
    keypoints: false,
    sharpness: false,
    noise: false,
};

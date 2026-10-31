export type { EvidenceCriterion, EvidenceLimitation, EvidenceGrid, EvidenceMaskRle, EvidenceDisplayGates, EvidenceSeparation, CriterionBand, ImageEvidencePayload } from '../../electron/imageEvidenceTypes';

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

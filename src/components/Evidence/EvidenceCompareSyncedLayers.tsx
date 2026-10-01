/**
 * Compare view (explainability §5): sync evidence layer toggles across two frames.
 * Wire when burst compare UI lands; until then this documents the contract.
 */
import type { EvidenceLayerState } from '../../types/imageEvidence';

export type CompareEvidenceSyncProps = {
    leftLayers: EvidenceLayerState;
    rightLayers: EvidenceLayerState;
    onSync: (layers: EvidenceLayerState) => void;
};

function mergeCompareLayers(a: EvidenceLayerState, b: EvidenceLayerState): EvidenceLayerState {
    return {
        region: a.region || b.region,
        mask: a.mask || b.mask,
        keypoints: a.keypoints || b.keypoints,
        sharpness: a.sharpness || b.sharpness,
        noise: a.noise || b.noise,
    };
}

/** Placeholder export for compare view integration tests. */
export function EvidenceCompareSyncedLayers({ leftLayers, rightLayers, onSync }: CompareEvidenceSyncProps) {
    return (
        <button type="button" data-testid="evidence-compare-sync" onClick={() => onSync(mergeCompareLayers(leftLayers, rightLayers))}>
            Sync evidence layers
        </button>
    );
}

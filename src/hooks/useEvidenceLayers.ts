import { useCallback, useState } from 'react';
import type { EvidenceDisplayGates, EvidenceLayerId, EvidenceLayerState } from '../types/imageEvidence';
import { DEFAULT_EVIDENCE_LAYERS } from '../types/imageEvidence';

function applyExclusivity(
    prev: EvidenceLayerState,
    layer: EvidenceLayerId,
    on: boolean,
): EvidenceLayerState {
    const next = { ...prev, [layer]: on };
    if (on && layer === 'sharpness') next.noise = false;
    if (on && layer === 'noise') next.sharpness = false;
    return next;
}

export function useEvidenceLayers(gates?: EvidenceDisplayGates | null) {
    const [layers, setLayers] = useState<EvidenceLayerState>(DEFAULT_EVIDENCE_LAYERS);
    const [panelOpen, setPanelOpen] = useState(false);

    const toggle = useCallback(
        (layer: EvidenceLayerId) => {
            setLayers((prev) => {
                const gatedOff =
                    (layer === 'region' && gates && !gates.region) ||
                    (layer === 'mask' && gates && !gates.mask) ||
                    (layer === 'keypoints' && gates && !gates.keypoints) ||
                    (layer === 'sharpness' && gates && !gates.focus_grid) ||
                    (layer === 'noise' && gates && !gates.noise_grid);
                if (gatedOff) return prev;
                return applyExclusivity(prev, layer, !prev[layer]);
            });
        },
        [gates],
    );

    const setLayer = useCallback(
        (layer: EvidenceLayerId, on: boolean) => {
            setLayers((prev) => applyExclusivity(prev, layer, on));
        },
        [],
    );

    const cyclePanel = useCallback(() => setPanelOpen((o) => !o), []);

    return { layers, toggle, setLayer, panelOpen, setPanelOpen, cyclePanel };
}

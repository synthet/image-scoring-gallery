import React from 'react';
import { EVIDENCE_LAYER_LABELS } from '@synthet/image-scoring-design';
import type { EvidenceDisplayGates, EvidenceLayerId, EvidenceLayerState } from '../../types/imageEvidence';

const ORDER: EvidenceLayerId[] = ['region', 'mask', 'keypoints', 'sharpness', 'noise'];

function gateFor(layer: EvidenceLayerId, gates: EvidenceDisplayGates | null | undefined): boolean {
    if (!gates) return true;
    switch (layer) {
        case 'region':
            return gates.region;
        case 'mask':
            return gates.mask;
        case 'keypoints':
            return gates.keypoints;
        case 'sharpness':
            return gates.focus_grid;
        case 'noise':
            return gates.noise_grid;
        default:
            return false;
    }
}

export interface EvidenceLayerChipsProps {
    layers: EvidenceLayerState;
    gates?: EvidenceDisplayGates | null;
    onToggle: (layer: EvidenceLayerId) => void;
}

export function EvidenceLayerChips({ layers, gates, onToggle }: EvidenceLayerChipsProps) {
    return (
        <div
            data-testid="evidence-layer-chips"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
        >
            {ORDER.map((id) => {
                const enabled = gateFor(id, gates);
                const active = layers[id];
                return (
                    <button
                        key={id}
                        type="button"
                        data-testid={`evidence-chip-${id}`}
                        disabled={!enabled}
                        onClick={() => onToggle(id)}
                        style={{
                            padding: '4px 10px',
                            borderRadius: 4,
                            border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                            background: active ? 'var(--color-accent-dim)' : 'var(--color-bg-tertiary)',
                            color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            cursor: enabled ? 'pointer' : 'not-allowed',
                            fontSize: '0.85em',
                        }}
                    >
                        {EVIDENCE_LAYER_LABELS[id]}
                    </button>
                );
            })}
        </div>
    );
}

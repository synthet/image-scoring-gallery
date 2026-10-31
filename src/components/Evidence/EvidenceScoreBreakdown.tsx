import React from 'react';
import { CRITERION_LABEL, resolveBandDisplay } from '@synthet/image-scoring-design';
import type { CriterionBand, EvidenceLayerId, ImageEvidencePayload } from '../../types/imageEvidence';

const CRITERION_LAYER: Partial<Record<string, EvidenceLayerId>> = {
    focus: 'sharpness',
    eye: 'keypoints',
    noise: 'noise',
};

export function EvidenceScoreBreakdown({
    evidence,
    onShowLayer,
}: {
    evidence: ImageEvidencePayload | null;
    onShowLayer?: (layer: EvidenceLayerId) => void;
}) {
    if (!evidence?.criteria?.length) return null;
    return (
        <div data-testid="evidence-score-breakdown" style={{ marginTop: 12 }}>
            <div style={{ fontSize: '0.85em', fontWeight: 600, marginBottom: 6 }}>Score breakdown</div>
            {evidence.criteria.map((row: CriterionBand) => {
                const band = resolveBandDisplay(row.band);
                const layer = CRITERION_LAYER[row.criterion];
                return (
                    <div
                        key={row.criterion}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8em',
                            padding: '4px 0',
                            borderBottom: '1px solid var(--color-border-muted)',
                        }}
                    >
                        <span>{CRITERION_LABEL[row.criterion] ?? row.criterion}</span>
                        <span style={{ color: `var(--evidence-band-${band.tier === 'unknown' ? 'unknown' : band.tier === 'good' ? 'good' : band.tier === 'fair' ? 'fair' : band.tier === 'weak' ? 'weak' : 'bad'})` }}>
                            {band.label}
                            {row.sub_score != null ? ` · ${row.sub_score}` : ''}
                        </span>
                        {layer && onShowLayer && (
                            <button type="button" onClick={() => onShowLayer(layer)} style={{ fontSize: '0.75em' }}>
                                Show
                            </button>
                        )}
                    </div>
                );
            })}
            {evidence.burst && (
                <div style={{ marginTop: 8, fontSize: '0.75em', color: 'var(--color-text-muted)' }}>
                    Burst explainability hooks (best frame / nearly tied) attach here — see planned doc §1.
                </div>
            )}
        </div>
    );
}

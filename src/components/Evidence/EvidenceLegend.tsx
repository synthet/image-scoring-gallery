import React from 'react';
import { HEATMAP_RAMP_RGBA, LIMITATION_LABEL } from '@synthet/image-scoring-design';
import type { ImageEvidencePayload } from '../../types/imageEvidence';

function rampCss(): string {
    const stops = HEATMAP_RAMP_RGBA.map(
        ([r, g, b, a], i, arr) =>
            `rgba(${r},${g},${b},${(a / 255).toFixed(2)}) ${(i / (arr.length - 1)) * 100}%`,
    );
    return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function EvidenceLegend({
    evidence,
    activeHeatmap,
}: {
    evidence: ImageEvidencePayload | null;
    activeHeatmap: 'sharpness' | 'noise' | null;
}) {
    if (!evidence) return null;
    const sep = evidence.separation;
    return (
        <div
            data-testid="evidence-legend"
            style={{
                marginTop: 12,
                padding: 12,
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                fontSize: '0.85em',
                color: 'var(--color-text-secondary)',
            }}
        >
            <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                Evidence
            </div>
            {activeHeatmap === 'sharpness' && sep?.ratio != null && (
                <div>
                    Sharpness · subject {sep.ratio.toFixed(1)}× vs background
                </div>
            )}
            {activeHeatmap === 'noise' && sep?.noise_sigma_mean != null && (
                <div>Noise · σ avg {sep.noise_sigma_mean.toFixed(2)}</div>
            )}
            {activeHeatmap && (
                <div
                    style={{
                        marginTop: 8,
                        height: 10,
                        borderRadius: 2,
                        background: rampCss(),
                    }}
                    aria-hidden
                />
            )}
            {evidence.limitations.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {evidence.limitations.map((code) => (
                        <li key={code}>{LIMITATION_LABEL[code] ?? code}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

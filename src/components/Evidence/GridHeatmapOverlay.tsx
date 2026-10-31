import React, { useEffect, useRef } from 'react';
import { HEATMAP_RAMP_RGBA, NOISE_RAMP_RGBA } from '@synthet/image-scoring-design';
import type { EvidenceGrid } from '../../types/imageEvidence';

function sampleRamp(
    ramp: ReadonlyArray<readonly [number, number, number, number]>,
    t: number,
): [number, number, number, number] {
    const clamped = Math.max(0, Math.min(1, t));
    const idx = clamped * (ramp.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(ramp.length - 1, lo + 1);
    const f = idx - lo;
    const a = ramp[lo];
    const b = ramp[hi];
    return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        Math.round(a[3] + (b[3] - a[3]) * f),
    ];
}

export function GridHeatmapOverlay({
    grid,
    mode,
    displayWidth,
    displayHeight,
}: {
    grid: EvidenceGrid;
    mode: 'sharpness' | 'noise';
    displayWidth: number;
    displayHeight: number;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ramp = mode === 'noise' ? NOISE_RAMP_RGBA : HEATMAP_RAMP_RGBA;
    const norm = grid.values_normalized ?? grid.values;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { cells_x, cells_y } = grid;
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        const cellW = displayWidth / cells_x;
        const cellH = displayHeight / cells_y;
        let min = Infinity;
        let max = -Infinity;
        for (const v of norm) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const span = max - min || 1;
        for (let cy = 0; cy < cells_y; cy++) {
            for (let cx = 0; cx < cells_x; cx++) {
                const raw = norm[cy * cells_x + cx] ?? 0;
                const t = (raw - min) / span;
                const [r, g, b, a] = sampleRamp(ramp, t);
                ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
                ctx.fillRect(cx * cellW, cy * cellH, cellW + 1, cellH + 1);
            }
        }
    }, [grid, displayWidth, displayHeight, ramp, norm]);

    return (
        <canvas
            ref={canvasRef}
            data-testid={`evidence-heatmap-${mode}`}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
}

import React, { useEffect, useMemo, useRef } from 'react';
import type { EvidenceMaskRle } from '../../types/imageEvidence';
import { decodeMaskRleInWorker } from '../../workers/evidenceMaskWorker';

export function SubjectMaskOverlay({
    mask,
    displayWidth,
    displayHeight,
}: {
    mask: EvidenceMaskRle;
    displayWidth: number;
    displayHeight: number;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const decoded = useMemo(
        () => decodeMaskRleInWorker({ width: mask.width, height: mask.height, counts: mask.counts }),
        [mask],
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !decoded) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        const img = ctx.createImageData(mask.width, mask.height);
        for (let i = 0; i < decoded.alpha.length; i++) {
            const a = decoded.alpha[i];
            const o = i * 4;
            if (a > 0) {
                img.data[o] = 0;
                img.data[o + 1] = 122;
                img.data[o + 2] = 204;
                img.data[o + 3] = a;
            }
        }
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, displayWidth, displayHeight);
        const off = document.createElement('canvas');
        off.width = mask.width;
        off.height = mask.height;
        off.getContext('2d')!.putImageData(img, 0, 0);
        ctx.drawImage(off, 0, 0, displayWidth, displayHeight);
    }, [decoded, displayWidth, displayHeight, mask]);

    return (
        <canvas
            ref={canvasRef}
            data-testid="evidence-mask-overlay"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
    );
}

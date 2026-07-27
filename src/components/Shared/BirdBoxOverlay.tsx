import type { BirdBoundingBox } from '../../../electron/types';

/**
 * Bird detection box, positioned as a fraction of the detector's `img_w`/`img_h` so it stays
 * aligned at whatever size the preview happens to render.
 */
export function BirdBoxOverlay({ bbox }: { bbox: BirdBoundingBox }) {
    if (!(bbox.img_w > 0) || !(bbox.img_h > 0)) return null;
    return (
        <div
            data-testid="bird-bbox-overlay"
            style={{
                position: 'absolute',
                pointerEvents: 'none',
                left: `${(bbox.x1 / bbox.img_w) * 100}%`,
                top: `${(bbox.y1 / bbox.img_h) * 100}%`,
                width: `${((bbox.x2 - bbox.x1) / bbox.img_w) * 100}%`,
                height: `${((bbox.y2 - bbox.y1) / bbox.img_h) * 100}%`,
                border: '2px solid var(--color-success)',
            }}
        />
    );
}

/** True when the box has usable detector dimensions for fractional positioning. */
export function isDrawableBirdBbox(bbox: BirdBoundingBox | null | undefined): bbox is BirdBoundingBox {
    return !!bbox && bbox.img_w > 0 && bbox.img_h > 0;
}

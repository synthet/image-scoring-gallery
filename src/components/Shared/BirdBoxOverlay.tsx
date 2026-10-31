import type { BirdBoundingBox } from '../../../electron/types';
import styles from './ImageOverlays.module.css';

/**
 * Bird detection box, positioned as a fraction of the detector's `img_w`/`img_h` so it stays
 * aligned at whatever size the preview happens to render.
 * A blue dashed frame distinguishes the detected subject from the camera AF target.
 */
export function BirdBoxOverlay({ bbox, showDetails = false }: { bbox: BirdBoundingBox; showDetails?: boolean }) {
    if (!(bbox.img_w > 0) || !(bbox.img_h > 0)) return null;
    return (
        <div
            data-testid="bird-bbox-overlay"
            className={`${styles.frame} ${styles.subject}`}
            style={{
                left: `${(bbox.x1 / bbox.img_w) * 100}%`,
                top: `${(bbox.y1 / bbox.img_h) * 100}%`,
                width: `${((bbox.x2 - bbox.x1) / bbox.img_w) * 100}%`,
                height: `${((bbox.y2 - bbox.y1) / bbox.img_h) * 100}%`,
            }}
        >
            {showDetails && <span className={styles.badge}>Subject · {Math.round(bbox.conf * 100)}%</span>}
        </div>
    );
}

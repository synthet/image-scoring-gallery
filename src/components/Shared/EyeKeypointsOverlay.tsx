import type { ImageEyeKeypoints } from '../../../electron/types';
import styles from './ImageOverlays.module.css';

/**
 * Eye markers from the backend's shadow keypoints (#426), positioned as fractions of the display
 * frame so they stay aligned at any preview size. Violet rings distinguish eyes from AF targets.
 */
export function EyeKeypointsOverlay({ eyes, size = 14, showDetails = false }: { eyes: ImageEyeKeypoints; size?: number; showDetails?: boolean }) {
    return (
        <>
            {eyes.points.map((p) => (
                <div
                    key={p.name}
                    data-testid="eye-keypoint-marker"
                    className={`${styles.frame} ${styles.eye}`}
                    title={`${p.name.replace('_', ' ')}${p.confidence == null ? '' : ` ${Math.round(p.confidence * 100)}%`}`}
                    style={{
                        left: `${p.x * 100}%`,
                        top: `${p.y * 100}%`,
                        width: size,
                        height: size,
                    }}
                >
                    {showDetails && <span className={styles.badge}>Eye{p.confidence == null ? '' : ` · ${Math.round(p.confidence * 100)}%`}</span>}
                </div>
            ))}
        </>
    );
}

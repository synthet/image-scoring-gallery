import type { ImageEyeKeypoints } from '../../../electron/types';
import { birdBboxBorderCss } from './birdBboxStyle';

/**
 * Eye markers from the backend's shadow keypoints (#426), positioned as fractions of the display
 * frame so they stay aligned at any preview size. Ring colour tracks point confidence with the same
 * red→yellow→green ramp as the bird box.
 */
export function EyeKeypointsOverlay({ eyes, size = 14 }: { eyes: ImageEyeKeypoints; size?: number }) {
    return (
        <>
            {eyes.points.map((p) => (
                <div
                    key={p.name}
                    data-testid="eye-keypoint-marker"
                    title={`${p.name.replace('_', ' ')}${p.confidence == null ? '' : ` ${Math.round(p.confidence * 100)}%`}`}
                    style={{
                        position: 'absolute',
                        pointerEvents: 'none',
                        left: `${p.x * 100}%`,
                        top: `${p.y * 100}%`,
                        width: size,
                        height: size,
                        transform: 'translate(-50%, -50%)',
                        borderRadius: '50%',
                        border: `2px solid ${birdBboxBorderCss(p.confidence ?? 0)}`,
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
                    }}
                />
            ))}
        </>
    );
}

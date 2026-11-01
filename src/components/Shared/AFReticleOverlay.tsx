import React from 'react';
import type { AFMetadata } from '../../../electron/types';
import styles from './ImageOverlays.module.css';

interface AFReticleOverlayProps {
    af?: AFMetadata | null;
    showDetails?: boolean;
}

/** Camera autofocus target with solid brackets, center crosshair and lock status. */
export const AFReticleOverlay: React.FC<AFReticleOverlayProps> = ({ af, showDetails = true }) => {
    if (!af) return null;
    const box = af.crop_box || af.box;
    if (!box || !(box.width > 0) || !(box.height > 0)) return null;
    const inFocus = Boolean(af.in_focus);
    const percent = (value: number) => Number((value * 100).toFixed(4)) + '%';
    // Grid thumbnails: anchor at the AF center so the CSS minimum size grows the box evenly
    // around the real point (a 152 px Z8 AF area is ~5 px on a thumbnail).
    const compact = !showDetails;
    const position = compact
        ? { left: percent(box.left + box.width / 2), top: percent(box.top + box.height / 2) }
        : { left: percent(box.left), top: percent(box.top) };

    return (
        <div
            data-testid="af-reticle-overlay"
            className={[styles.frame, styles.focus, inFocus ? styles.locked : '', compact ? styles.compact : ''].join(' ')}
            style={{ ...position, width: percent(box.width), height: percent(box.height) }}
        >
            <span className={styles.crosshair} />
            <span className={[styles.corner, styles.topLeft].join(' ')} />
            <span className={[styles.corner, styles.topRight].join(' ')} />
            <span className={[styles.corner, styles.bottomLeft].join(' ')} />
            <span className={[styles.corner, styles.bottomRight].join(' ')} />
            {showDetails && (
                <div className={styles.badge}>
                    <span className={styles.statusDot} />
                    <span>AF · {af.mode || 'Focus Point'}</span>
                    <span className={inFocus ? styles.status : styles.muted}>{inFocus ? 'LOCKED' : 'UNCONFIRMED'}</span>
                    {af.focus_distance_m != null && <span className={styles.muted}>{af.focus_distance_m.toFixed(2)}m</span>}
                </div>
            )}
        </div>
    );
};

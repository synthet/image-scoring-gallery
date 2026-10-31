import React from 'react';
import type { AFMetadata } from '../../../electron/types';

interface AFReticleOverlayProps {
    af?: AFMetadata | null;
    showDetails?: boolean;
}

/**
 * Camera Viewfinder Autofocus Reticle Overlay.
 * Renders the camera's exact autofocus target area, center crosshair, corner brackets,
 * and lock state HUD on top of the displayed image.
 */
export const AFReticleOverlay: React.FC<AFReticleOverlayProps> = ({ af, showDetails = true }) => {
    if (!af) return null;
    const box = af.crop_box || af.box;
    if (!box || !(box.width > 0) || !(box.height > 0)) return null;

    const inFocus = Boolean(af.in_focus);
    // Green when locked/in-focus; Amber/Red when unconfirmed or out-of-focus
    const primaryColor = inFocus ? '#00e676' : '#ff9100';
    const glowColor = inFocus ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255, 145, 0, 0.4)';
    const bgColor = inFocus ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 145, 0, 0.08)';

    const leftPct = `${Number((box.left * 100).toFixed(4))}%`;
    const topPct = `${Number((box.top * 100).toFixed(4))}%`;
    const widthPct = `${Number((box.width * 100).toFixed(4))}%`;
    const heightPct = `${Number((box.height * 100).toFixed(4))}%`;

    return (
        <div
            data-testid="af-reticle-overlay"
            style={{
                position: 'absolute',
                left: leftPct,
                top: topPct,
                width: widthPct,
                height: heightPct,
                pointerEvents: 'none',
                boxSizing: 'border-box',
                border: `1.5px solid ${primaryColor}`,
                backgroundColor: bgColor,
                boxShadow: `0 0 8px ${glowColor}, inset 0 0 6px ${glowColor}`,
                zIndex: 15,
                transition: 'all 0.15s ease-out',
            }}
        >
            {/* Center Crosshair */}
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: '12px',
                    height: '1px',
                    backgroundColor: primaryColor,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `0 0 4px ${glowColor}`,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: '1px',
                    height: '12px',
                    backgroundColor: primaryColor,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `0 0 4px ${glowColor}`,
                }}
            />

            {/* Viewfinder Corner Ticks */}
            <div
                style={{
                    position: 'absolute',
                    top: -2,
                    left: -2,
                    width: 6,
                    height: 6,
                    borderTop: `2.5px solid ${primaryColor}`,
                    borderLeft: `2.5px solid ${primaryColor}`,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderTop: `2.5px solid ${primaryColor}`,
                    borderRight: `2.5px solid ${primaryColor}`,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: -2,
                    left: -2,
                    width: 6,
                    height: 6,
                    borderBottom: `2.5px solid ${primaryColor}`,
                    borderLeft: `2.5px solid ${primaryColor}`,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderBottom: `2.5px solid ${primaryColor}`,
                    borderRight: `2.5px solid ${primaryColor}`,
                }}
            />

            {/* HUD Status Pill */}
            {showDetails && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%) translateY(-6px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '2px 7px',
                        backgroundColor: 'rgba(15, 23, 42, 0.85)',
                        border: `1px solid ${primaryColor}`,
                        borderRadius: 3,
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: '#f8fafc',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                        pointerEvents: 'none',
                    }}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: primaryColor,
                            boxShadow: `0 0 4px ${primaryColor}`,
                        }}
                    />
                    <span>{af.mode || 'AF'}</span>
                    {inFocus ? (
                        <span style={{ color: primaryColor }}>LOCKED</span>
                    ) : (
                        <span style={{ color: '#94a3b8' }}>UNCONFIRMED</span>
                    )}
                    {af.focus_distance_m != null && (
                        <span style={{ color: '#94a3b8' }}>{af.focus_distance_m.toFixed(2)}m</span>
                    )}
                </div>
            )}
        </div>
    );
};

import { Loader2, X } from 'lucide-react';

interface SimilarSearchLoadingOverlayProps {
    visible: boolean;
    percent: number;
    tick: number;
    progressMax: number;
    onCancel: () => void;
    lastDurationMs?: number | null;
}

export function SimilarSearchLoadingOverlay({
    visible,
    percent,
    tick,
    progressMax,
    onCancel,
    lastDurationMs,
}: SimilarSearchLoadingOverlayProps) {
    if (!visible) {
        return null;
    }

    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                padding: 24,
                backgroundColor: 'rgba(0, 0, 0, 0.72)',
                backdropFilter: 'blur(2px)',
            }}
        >
            <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel similar image search"
                title="Cancel search"
                style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: 6,
                    background: 'rgba(40,40,40,0.9)',
                    color: '#eee',
                    cursor: 'pointer',
                }}
            >
                <X size={18} />
            </button>

            <Loader2 size={36} className="app-spinner" strokeWidth={1.5} aria-hidden />

            <div style={{ width: '100%', maxWidth: 240, textAlign: 'center' }}>
                <div style={{ color: '#ddd', fontSize: '0.9em', marginBottom: 8 }}>
                    Searching for similar images…
                </div>
                <div
                    style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            height: '100%',
                            width: `${percent}%`,
                            borderRadius: 3,
                            backgroundColor: '#4a9eff',
                            transition: 'width 120ms ease-out',
                        }}
                    />
                </div>
                <div style={{ marginTop: 8, color: '#999', fontSize: '0.75em' }}>
                    {percent}%
                    {progressMax > 0 && (
                        <span style={{ marginLeft: 6, opacity: 0.85 }}>
                            ({tick} / {progressMax})
                        </span>
                    )}
                </div>
                {lastDurationMs != null && lastDurationMs > 0 && (
                    <div style={{ marginTop: 6, color: '#666', fontSize: '0.7em' }}>
                        Last search: {(lastDurationMs / 1000).toFixed(1)}s
                    </div>
                )}
            </div>
        </div>
    );
}

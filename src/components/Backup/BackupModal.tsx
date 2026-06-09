import React, { useState, useEffect, useRef } from 'react';
import { bridge } from '../../bridge';
import type { BackupPreviewInfo, BackupProgress, BackupResult, BackupTargetInfo } from '../../../electron/types';

interface Props {
    isOpen: boolean;
    targetPath: string;
    onClose: () => void;
    onComplete?: () => void;
}

const PHASE_LABELS: Record<string, string> = {
    scanning: 'Scanning database',
    deduplicating: 'Removing similar images',
    calculating: 'Preparing files',
    copying: 'Copying to backup',
    cleaning: 'Finalizing',
    done: 'Complete',
};

export const BackupModal: React.FC<Props> = ({ isOpen, targetPath, onClose, onComplete }) => {
    const [progress, setProgress] = useState<BackupProgress>({ phase: 'scanning', current: 0, total: 0, detail: '' });
    const [result, setResult] = useState<BackupResult | null>(null);
    const [targetInfo, setTargetInfo] = useState<BackupTargetInfo | null>(null);
    const [preview, setPreview] = useState<BackupPreviewInfo | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const runRef = useRef(false);

    useEffect(() => {
        if (isOpen && targetPath) {
            bridge.backupCheckTarget(targetPath)
                .then(info => setTargetInfo(info))
                .catch(err => console.error('Failed to check backup target:', err));

            setPreviewLoading(true);
            bridge.backupPreview(targetPath)
                .then(info => setPreview(info))
                .catch(err => console.error('Failed to load backup preview:', err))
                .finally(() => setPreviewLoading(false));
        }
    }, [isOpen, targetPath]);

    useEffect(() => {
        if (!isOpen) return;
        runRef.current = false;
        setIsRunning(false);
        setIsComplete(false);
        setResult(null);
        setError(null);
        setShowDeleteConfirm(false);
        setPreview(null);
        setProgress({ phase: 'scanning', current: 0, total: 0, detail: '' });
    }, [isOpen, targetPath]);

    const runBackup = (confirmMassDelete: boolean) => {
        if (!targetPath || isRunning) return;

        runRef.current = true;
        setIsRunning(true);
        setIsComplete(false);
        setError(null);
        setResult(null);
        setShowDeleteConfirm(false);
        setProgress({ phase: 'scanning', current: 0, total: 0, detail: 'Starting…' });

        const cleanupProgress = bridge.onBackupProgress((data) => {
            if (runRef.current) {
                setProgress(data);
            }
        });

        bridge.backupRun(targetPath, { confirmMassDelete })
            .then((res) => {
                if (runRef.current) {
                    setResult(res);
                    setIsComplete(true);
                }
            })
            .catch((err: unknown) => {
                if (runRef.current) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            })
            .finally(() => {
                if (runRef.current) {
                    setIsRunning(false);
                }
                cleanupProgress();
            });
    };

    const startBackup = () => {
        if (preview?.requiresConfirm) {
            setShowDeleteConfirm(true);
            return;
        }
        runBackup(false);
    };

    const confirmMassDeleteAndRun = () => {
        runBackup(true);
    };

    useEffect(() => {
        return () => {
            runRef.current = false;
        };
    }, []);

    const handleClose = () => {
        if (isComplete && onComplete) {
            onComplete();
        }
        onClose();
    };

    if (!isOpen) return null;

    const truncatedPath = targetPath.length > 60 ? targetPath.slice(0, 57) + '...' : targetPath;
    const phaseLabel = PHASE_LABELS[progress.phase] || progress.phase;
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    const hasDestructiveOutcome = result && (
        result.staleRemoved > 0
        || result.droppedForSpace > 0
        || (result.manifestPruned ?? 0) > 0
    );

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                backgroundColor: '#1e1e1e', borderRadius: '12px',
                width: '600px', maxWidth: '95vw',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                border: '1px solid #333',
                color: '#e0e0e0',
                maxHeight: '90vh',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'linear-gradient(to right, #252526, #1e1e1e)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.4em', fontWeight: 600, letterSpacing: '0.02em' }}>Backup</h2>
                    <button
                        onClick={handleClose}
                        disabled={isRunning}
                        style={{
                            background: 'none', border: 'none', color: '#888', cursor: isRunning ? 'not-allowed' : 'pointer',
                            fontSize: '1.8em', padding: 0, lineHeight: 1, opacity: isRunning ? 0.3 : 1,
                            transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => !isRunning && (e.currentTarget.style.color = '#fff')}
                        onMouseLeave={(e) => !isRunning && (e.currentTarget.style.color = '#888')}
                    >&times;</button>
                </div>

                <div style={{ padding: '24px', overflowY: 'auto' }}>
                    <div style={{ fontSize: '0.95em', color: '#aaa', marginBottom: 20, wordBreak: 'break-all', display: 'flex', alignItems: 'center' }}>
                        <span style={{ marginRight: 8, opacity: 0.7 }}>Target:</span>
                        <code style={{ background: '#2d2d2d', padding: '4px 8px', borderRadius: 4, color: '#00a2ff' }}>{truncatedPath}</code>
                    </div>

                    {!isRunning && !isComplete && !error && !showDeleteConfirm && (
                        <div style={{ marginBottom: 24, padding: '16px', background: '#252526', borderRadius: 8, border: '1px solid #333' }}>
                            <div style={{ fontSize: '0.85em', color: '#aaa', lineHeight: 1.6 }}>
                                Backup selects scored images by quality and available disk space.
                                By default, existing files on the destination are kept (additive mode).
                                XMP sidecars are copied alongside images.
                            </div>
                        </div>
                    )}

                    {previewLoading && !isRunning && !isComplete && (
                        <div style={{ marginBottom: 16, fontSize: '0.85em', color: '#888' }}>
                            Analyzing selection and destination…
                        </div>
                    )}

                    {preview && !isRunning && !isComplete && !error && !showDeleteConfirm && (
                        <div style={{
                            marginBottom: 24, padding: '14px 16px', background: '#252526',
                            borderRadius: 8, border: '1px solid #333', fontSize: '0.88em', lineHeight: 1.7,
                        }}>
                            <div style={{ fontWeight: 600, marginBottom: 8, color: '#ddd' }}>Pre-flight</div>
                            <div>Min score: <strong>{preview.minScore}</strong></div>
                            <div>Scored candidates: <strong>{preview.candidateCount.toLocaleString()}</strong></div>
                            <div>Planned for this run: <strong>{preview.plannedCount.toLocaleString()}</strong></div>
                            <div>Manifest entries: <strong>{preview.manifestCount.toLocaleString()}</strong></div>
                            {!preview.pruneStaleFiles && preview.manifestPrunedCount > 0 && (
                                <div style={{ color: '#888', marginTop: 4 }}>
                                    Manifest rows not in plan: {preview.manifestPrunedCount.toLocaleString()} (files kept on disk)
                                </div>
                            )}
                            {preview.pruneStaleFiles && (
                                <div style={{ marginTop: 8, color: preview.wouldDeleteFiles > 0 ? '#ffb74d' : '#aaa' }}>
                                    Mirror prune enabled — files to delete from disk:{' '}
                                    <strong>{preview.wouldDeleteFiles.toLocaleString()}</strong>
                                    {preview.prebuildProtectedCount > 0 && (
                                        <span style={{ color: '#888' }}>
                                            {' '}({preview.prebuildProtectedCount.toLocaleString()} prebuild entries protected until confirmed)
                                        </span>
                                    )}
                                </div>
                            )}
                            {preview.pruneDroppedForSpace && (
                                <div style={{ marginTop: 8, color: preview.wouldDeleteDroppedForSpace > 0 ? '#ffb74d' : '#aaa' }}>
                                    Space prune enabled — existing copies to delete for space:{' '}
                                    <strong>{preview.wouldDeleteDroppedForSpace.toLocaleString()}</strong>
                                </div>
                            )}
                        </div>
                    )}

                    {showDeleteConfirm && preview && (
                        <div style={{
                            marginBottom: 24, padding: '16px', background: 'rgba(255,107,107,0.08)',
                            borderRadius: 8, border: '1px solid rgba(255,107,107,0.4)',
                        }}>
                            <div style={{ fontWeight: 600, color: '#ff6b6b', marginBottom: 8 }}>
                                Confirm permanent deletion
                            </div>
                            <div style={{ fontSize: '0.9em', lineHeight: 1.6, color: '#ddd' }}>
                                This run will <strong>permanently delete{' '}
                                {(preview.wouldDeleteFiles + preview.wouldDeleteDroppedForSpace).toLocaleString()} files</strong> from
                                the backup folder.
                                {preview.wouldDeleteFiles > 0 && (
                                    <> {preview.wouldDeleteFiles.toLocaleString()} are no longer in the current selection.</>
                                )}
                                {preview.wouldDeleteDroppedForSpace > 0 && (
                                    <> {preview.wouldDeleteDroppedForSpace.toLocaleString()} are existing copies dropped for insufficient disk space.</>
                                )}
                                {preview.prebuildProtectedCount > 0 && (
                                    <> Prebuild entries ({preview.prebuildProtectedCount.toLocaleString()}) will also be removed if you continue.</>
                                )}
                            </div>
                        </div>
                    )}

                    {targetInfo && !isRunning && !isComplete && !error && !showDeleteConfirm && (
                        <div style={{ marginBottom: 24, fontSize: '0.9em', color: '#ccc' }}>
                            {targetInfo.exists ? (
                                <div style={{ padding: '12px', background: 'rgba(0,162,255,0.05)', border: '1px solid rgba(0,162,255,0.2)', borderRadius: 6 }}>
                                    <div style={{ marginBottom: 4 }}>Found existing backup manifest.</div>
                                    <div style={{ color: '#888' }}>
                                        Images: <strong>{targetInfo.imageCount}</strong> |
                                        Size: <strong>{(targetInfo.bytes / (1024 * 1024 * 1024)).toFixed(2)} GB</strong> |
                                        Last sync: <strong>{targetInfo.lastBackup ? new Date(targetInfo.lastBackup).toLocaleDateString() : 'Never'}</strong>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '12px', background: 'rgba(255,169,77,0.05)', border: '1px solid rgba(255,169,77,0.2)', borderRadius: 6 }}>
                                    Notice: Target directory is empty or missing manifest. A fresh backup will be started.
                                </div>
                            )}
                        </div>
                    )}

                    {error ? (
                        <div style={{
                            color: '#ff6b6b', padding: '16px', background: 'rgba(255,107,107,0.1)',
                            borderRadius: 8, border: '1px solid rgba(255,107,107,0.3)',
                            marginBottom: 20
                        }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Error occurred</div>
                            <div style={{ fontSize: '0.9em', whiteSpace: 'pre-wrap' }}>{error}</div>
                        </div>
                    ) : (
                        <>
                            {(isRunning || isComplete) && (
                                <div style={{ marginBottom: 24 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 500, color: isComplete ? 'var(--color-success)' : '#ddd' }}>
                                            {isRunning
                                                ? `${phaseLabel}...`
                                                : 'Backup process finished'}
                                        </span>
                                        {progress.total > 0 && isRunning && (
                                            <span style={{ color: '#888' }}>{progress.current} / {progress.total} ({pct}%)</span>
                                        )}
                                    </div>
                                    <div style={{
                                        height: 10, backgroundColor: '#333', borderRadius: 5, overflow: 'hidden',
                                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            backgroundColor: isComplete ? 'var(--color-success)' : '#0078d4',
                                            width: progress.total > 0 ? `${pct}%` : isComplete ? '100%' : '5%',
                                            transition: 'width 0.3s ease-out',
                                            boxShadow: isRunning ? '0 0 10px rgba(0,120,212,0.5)' : 'none'
                                        }} />
                                    </div>

                                    {progress.detail && isRunning && (
                                        <div style={{
                                            fontSize: '0.8em', color: '#777', marginTop: 10,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            fontFamily: 'monospace', background: '#161616', padding: '4px 8px', borderRadius: 4
                                        }}>
                                            {progress.detail}
                                        </div>
                                    )}
                                </div>
                            )}

                            {isComplete && result && (
                                <div style={{
                                    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px',
                                    padding: '20px', background: '#252526', borderRadius: 8, border: '1px solid #333'
                                }}>
                                    <div style={{ fontSize: '0.9em' }}>
                                        <div style={{ color: '#888', fontSize: '0.8em', textTransform: 'uppercase', marginBottom: 4 }}>Copied</div>
                                        <div style={{ fontSize: '1.5em', fontWeight: 600, color: 'var(--color-success)' }}>{result.copied}</div>
                                    </div>
                                    <div style={{ fontSize: '0.9em' }}>
                                        <div style={{ color: '#888', fontSize: '0.8em', textTransform: 'uppercase', marginBottom: 4 }}>Skipped</div>
                                        <div style={{ fontSize: '1.5em', fontWeight: 600, color: '#aaa' }}>{result.skipped}</div>
                                    </div>
                                    <div style={{ fontSize: '0.9em' }}>
                                        <div style={{ color: '#888', fontSize: '0.8em', textTransform: 'uppercase', marginBottom: 4 }}>Deduplicated</div>
                                        <div style={{ fontSize: '1.5em', fontWeight: 600, color: '#00a2ff' }}>{result.deduplicated}</div>
                                    </div>
                                    <div style={{ fontSize: '0.9em' }}>
                                        <div style={{ color: '#888', fontSize: '0.8em', textTransform: 'uppercase', marginBottom: 4 }}>Errors</div>
                                        <div style={{ fontSize: '1.5em', fontWeight: 600, color: result.errors.length > 0 ? '#ff6b6b' : '#888' }}>{result.errors.length}</div>
                                    </div>
                                </div>
                            )}

                            {isComplete && hasDestructiveOutcome && result && (
                                <div style={{
                                    marginTop: 16, padding: '14px 16px',
                                    background: 'rgba(255,183,77,0.08)', border: '1px solid rgba(255,183,77,0.35)',
                                    borderRadius: 8, fontSize: '0.9em', lineHeight: 1.6,
                                }}>
                                    <div style={{ fontWeight: 600, color: '#ffb74d', marginBottom: 8 }}>Files removed or omitted</div>
                                    {result.staleRemoved > 0 && (
                                        <div>
                                            Deleted from disk (no longer in selection):{' '}
                                            <strong style={{ color: '#ff6b6b' }}>{result.staleRemoved.toLocaleString()}</strong>
                                        </div>
                                    )}
                                    {(result.manifestPruned ?? 0) > 0 && result.staleRemoved === 0 && (
                                        <div>
                                            Manifest rows pruned (files kept):{' '}
                                            <strong>{(result.manifestPruned ?? 0).toLocaleString()}</strong>
                                        </div>
                                    )}
                                    {(result.prebuildProtected ?? 0) > 0 && (
                                        <div style={{ color: '#aaa' }}>
                                            Prebuild entries kept on disk:{' '}
                                            <strong>{(result.prebuildProtected ?? 0).toLocaleString()}</strong>
                                        </div>
                                    )}
                                    {result.droppedForSpace > 0 && (
                                        <div>
                                            Omitted for insufficient space:{' '}
                                            <strong style={{ color: '#ffb74d' }}>{result.droppedForSpace.toLocaleString()}</strong>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isComplete && result && result.warnings && result.warnings.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <div style={{ fontSize: '0.85em', color: '#ffb74d', marginBottom: 8, fontWeight: 600 }}>
                                        Warnings
                                    </div>
                                    <div style={{
                                        maxHeight: '100px', overflowY: 'auto', background: '#161616',
                                        padding: '12px', borderRadius: 6, fontSize: '0.8em', border: '1px solid #333',
                                    }}>
                                        {result.warnings.map((w, i) => (
                                            <div key={i} style={{ color: '#ccc', marginBottom: 4 }}>• {w}</div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isComplete && result && result.errors.length > 0 && (
                                <div style={{ marginTop: 20 }}>
                                    <div style={{ fontSize: '0.85em', color: '#ff6b6b', marginBottom: 8, fontWeight: 600 }}>Error Details:</div>
                                    <div style={{
                                        maxHeight: '120px', overflowY: 'auto', background: '#161616',
                                        padding: '12px', borderRadius: 6, fontSize: '0.8em', border: '1px solid #333'
                                    }}>
                                        {result.errors.map((e, i) => (
                                            <div key={i} style={{ color: '#ccc', marginBottom: 4, fontFamily: 'monospace' }}>• {e}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{
                    padding: '16px 24px', borderTop: '1px solid #333', background: '#252526',
                    display: 'flex', justifyContent: 'flex-end', gap: '12px'
                }}>
                    {!isRunning && !isComplete && !error && !showDeleteConfirm && (
                        <button
                            onClick={onClose}
                            style={{
                                padding: '10px 20px', background: 'transparent', border: '1px solid #444',
                                color: '#ccc', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#333';
                                e.currentTarget.style.borderColor = '#555';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = '#444';
                            }}
                        >
                            Cancel
                        </button>
                    )}

                    {showDeleteConfirm && !isRunning && (
                        <>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                style={{
                                    padding: '10px 20px', background: 'transparent', border: '1px solid #444',
                                    color: '#ccc', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
                                }}
                            >
                                Go back
                            </button>
                            <button
                                onClick={confirmMassDeleteAndRun}
                                style={{
                                    padding: '10px 24px', background: '#c0392b', border: 'none',
                                    color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                                }}
                            >
                                Delete {((preview?.wouldDeleteFiles ?? 0) + (preview?.wouldDeleteDroppedForSpace ?? 0)).toLocaleString()} files and continue
                            </button>
                        </>
                    )}

                    {!isRunning && !isComplete && !error && !showDeleteConfirm && (
                        <button
                            onClick={startBackup}
                            disabled={previewLoading}
                            style={{
                                padding: '10px 24px', background: previewLoading ? '#555' : '#0078d4', border: 'none',
                                color: '#fff', borderRadius: 6, cursor: previewLoading ? 'wait' : 'pointer', fontWeight: 600,
                                transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,120,212,0.3)'
                            }}
                            onMouseEnter={(e) => !previewLoading && (e.currentTarget.style.background = '#1084e4')}
                            onMouseLeave={(e) => !previewLoading && (e.currentTarget.style.background = '#0078d4')}
                        >
                            Start Backup
                        </button>
                    )}

                    {(isComplete || error) && (
                        <button
                            onClick={handleClose}
                            style={{
                                padding: '10px 24px', background: isComplete ? 'var(--color-success)' : '#444',
                                border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer',
                                fontWeight: 600, transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            {isComplete ? 'Finish' : 'Close'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

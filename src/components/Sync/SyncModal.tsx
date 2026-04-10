import React, { useState, useEffect, useRef, useCallback } from 'react';
import { bridge } from '../../bridge';
import { useOperationStore } from '../../store/useOperationStore';
import { Logger } from '../../services/Logger';

interface SyncResult {
    scanned: number;
    copied: number;
    imported: number;
    skipped: number;
    folders: number;
    errors: string[];
    thresholdDate: string | null;
}

interface SyncPreviewData {
    thresholdDate: string | null;
    destinationRoot: string;
    scanned: number;
    skipped: number;
    wouldCopy: number;
    importOnly: number;
    newFolders: string[];
    errors: string[];
}

interface SyncProgress {
    phase: string;
    current: number;
    total: number;
    detail: string;
}

interface Props {
    isOpen: boolean;
    sourcePath: string;
    onClose: () => void;
    onComplete?: () => void;
}

const PHASE_LABELS: Record<string, string> = {
    detecting: 'Detecting last sync',
    scanning: 'Scanning source',
    preview: 'Preview (analyzing files)',
    copying: 'Copying new files',
    importing: 'Importing into database',
    done: 'Complete',
};

export const SyncModal: React.FC<Props> = ({ isOpen, sourcePath, onClose, onComplete }) => {
    const [progress, setProgress] = useState<SyncProgress>({ phase: '', current: 0, total: 0, detail: '' });
    const [preview, setPreview] = useState<SyncPreviewData | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const [result, setResult] = useState<SyncResult | null>(null);
    const [isSyncRunning, setIsSyncRunning] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [isComplete, setIsComplete] = useState(false);

    const runRef = useRef(false);
    const modeRef = useRef<'preview' | 'sync'>('preview');
    const opIdRef = useRef<string>('');
    const { startOp, updateOp, completeOp } = useOperationStore();

    useEffect(() => {
        if (!isOpen || !sourcePath) return;

        runRef.current = true;
        modeRef.current = 'preview';
        setPreview(null);
        setPreviewError(null);
        setResult(null);
        setSyncError(null);
        setIsComplete(false);
        setPreviewLoading(true);
        setProgress({ phase: 'detecting', current: 0, total: 0, detail: 'Starting…' });
        Logger.info('[SyncModal] Preview started', { sourcePath });

        const cleanupProgress = bridge.onSyncProgress((data) => {
            if (runRef.current && modeRef.current === 'preview') {
                setProgress(data);
            }
        });

        bridge
            .syncPreview(sourcePath)
            .then((res) => {
                if (runRef.current) {
                    setPreview(res);
                    Logger.info('[SyncModal] Preview completed', {
                        sourcePath,
                        destination: res.destinationRoot,
                        wouldCopy: res.wouldCopy,
                        importOnly: res.importOnly,
                        scanned: res.scanned,
                        skipped: res.skipped,
                        newFolders: res.newFolders.length,
                        errors: res.errors.length,
                        thresholdDate: res.thresholdDate,
                    });
                    if (res.errors.length > 0) {
                        Logger.warn('[SyncModal] Preview produced warnings', {
                            errors: res.errors.slice(0, 10),
                        });
                    }
                }
            })
            .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                Logger.error('[SyncModal] Preview failed', { sourcePath, error: msg });
                if (runRef.current) {
                    setPreviewError(msg);
                }
            })
            .finally(() => {
                if (runRef.current) {
                    setPreviewLoading(false);
                }
                cleanupProgress();
            });

        return () => {
            Logger.info('[SyncModal] Preview cleanup — effect unmounting', { sourcePath });
            runRef.current = false;
            cleanupProgress();
        };
    }, [isOpen, sourcePath]);

    const handleStartSync = useCallback(() => {
        if (!sourcePath || previewLoading || isSyncRunning) return;

        const opId = `sync-${Date.now()}`;
        opIdRef.current = opId;
        runRef.current = true;
        modeRef.current = 'sync';
        setIsSyncRunning(true);
        setSyncError(null);
        setResult(null);
        setIsComplete(false);
        setProgress({ phase: 'detecting', current: 0, total: 0, detail: 'Starting…' });
        startOp(opId, 'sync', 'Syncing…');
        Logger.info('[SyncModal] Sync run started', { opId, sourcePath });

        let lastLoggedPhase = '';
        let lastLoggedPct = -1;
        const cleanupProgress = bridge.onSyncProgress((data) => {
            if (runRef.current && modeRef.current === 'sync') {
                setProgress(data);
                const phaseLabel = PHASE_LABELS[data.phase] || data.phase;
                updateOp(opId, {
                    current: data.current,
                    total: data.total,
                    label: data.total > 0
                        ? `${phaseLabel} ${data.current}/${data.total}`
                        : phaseLabel,
                });
                // Log on phase change or every 10% progress
                const pct = data.total > 0 ? Math.floor((data.current / data.total) * 10) * 10 : 0;
                if (data.phase !== lastLoggedPhase) {
                    lastLoggedPhase = data.phase;
                    lastLoggedPct = -1;
                    Logger.info(`[SyncModal] Phase: ${phaseLabel}`, {
                        opId, phase: data.phase, current: data.current, total: data.total, detail: data.detail,
                    });
                } else if (pct !== lastLoggedPct) {
                    lastLoggedPct = pct;
                    Logger.info(`[SyncModal] Progress ${pct}%`, {
                        opId, phase: data.phase, current: data.current, total: data.total,
                    });
                }
            }
        });

        bridge
            .syncRun(sourcePath)
            .then((res) => {
                if (runRef.current) {
                    setResult(res);
                    setIsComplete(true);
                    Logger.info('[SyncModal] Sync completed', {
                        opId,
                        scanned: res.scanned,
                        copied: res.copied,
                        imported: res.imported,
                        skipped: res.skipped,
                        folders: res.folders,
                        errorCount: res.errors.length,
                        thresholdDate: res.thresholdDate,
                    });
                    if (res.errors.length > 0) {
                        Logger.warn('[SyncModal] Sync finished with errors', {
                            opId, errors: res.errors.slice(0, 20),
                        });
                    }
                }
            })
            .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                Logger.error('[SyncModal] Sync run failed', { opId, error: msg });
                if (runRef.current) {
                    setSyncError(msg);
                }
            })
            .finally(() => {
                cleanupProgress();
                completeOp(opId);
                if (runRef.current) {
                    setIsSyncRunning(false);
                }
            });
    }, [sourcePath, previewLoading, isSyncRunning, startOp, updateOp, completeOp]);

    const handleClose = () => {
        if (isComplete && onComplete) {
            onComplete();
        }
        onClose();
    };

    const truncatedPath = sourcePath.length > 60 ? sourcePath.slice(0, 57) + '...' : sourcePath;
    const phaseLabel = PHASE_LABELS[progress.phase] || progress.phase;
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    const blockingSync = isSyncRunning;
    const destTrunc =
        preview && preview.destinationRoot.length > 56
            ? preview.destinationRoot.slice(0, 53) + '...'
            : preview?.destinationRoot ?? '';

    const nothingToDo =
        preview && preview.wouldCopy === 0 && preview.importOnly === 0 && preview.errors.length === 0;

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(4px)',
            }}
        >
            <div
                style={{
                    backgroundColor: '#1e1e1e',
                    borderRadius: '8px',
                    width: '540px',
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    border: '1px solid #444',
                    color: '#e0e0e0',
                }}
            >
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #333',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0,
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 600 }}>Sync from device</h2>
                    <button
                        onClick={handleClose}
                        disabled={blockingSync}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            cursor: blockingSync ? 'not-allowed' : 'pointer',
                            fontSize: '1.5em',
                            padding: 0,
                            lineHeight: 1,
                            opacity: blockingSync ? 0.5 : 1,
                        }}
                        title="Close"
                    >
                        &times;
                    </button>
                </div>

                <div style={{ padding: '24px 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: 16, wordBreak: 'break-all' }}>
                        Source: {truncatedPath}
                    </div>

                    {previewError ? (
                        <div
                            style={{
                                color: '#ff6b6b',
                                padding: '12px',
                                background: 'rgba(255,107,107,0.1)',
                                borderRadius: 4,
                                border: '1px solid rgba(255,107,107,0.3)',
                            }}
                        >
                            {previewError}
                        </div>
                    ) : (
                        <>
                            {syncError && (
                                <div
                                    style={{
                                        color: '#ff6b6b',
                                        padding: '12px',
                                        marginBottom: 16,
                                        background: 'rgba(255,107,107,0.1)',
                                        borderRadius: 4,
                                        border: '1px solid rgba(255,107,107,0.3)',
                                    }}
                                >
                                    {syncError}
                                </div>
                            )}
                            {previewLoading && (
                                <>
                                    <div style={{ marginBottom: 12 }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontSize: '0.85em',
                                                marginBottom: 4,
                                            }}
                                        >
                                            <span>
                                                {phaseLabel}:{' '}
                                                {progress.total > 0
                                                    ? `${progress.current} / ${progress.total}`
                                                    : progress.detail || '…'}
                                            </span>
                                            {progress.total > 0 && (
                                                <span style={{ color: '#888' }}>{pct}%</span>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                height: 8,
                                                backgroundColor: '#333',
                                                borderRadius: 4,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    height: '100%',
                                                    backgroundColor: '#0078d4',
                                                    width: progress.total > 0 ? `${pct}%` : '0%',
                                                    transition: 'width 0.2s ease',
                                                }}
                                            />
                                        </div>
                                    </div>
                                    {progress.detail && progress.phase !== 'done' && (
                                        <div
                                            style={{
                                                fontSize: '0.8em',
                                                color: '#888',
                                                marginBottom: 12,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {progress.detail}
                                        </div>
                                    )}
                                </>
                            )}

                            {!previewLoading && preview && !isSyncRunning && !isComplete && (
                                <div style={{ fontSize: '0.9em', color: '#ccc', lineHeight: 1.7 }}>
                                    <div style={{ color: '#888', marginBottom: 8, wordBreak: 'break-all' }}>
                                        Destination: <strong style={{ color: '#ccc' }}>{destTrunc}</strong>
                                    </div>

                                    <div style={{ marginBottom: 4 }}>
                                        <strong>{preview.wouldCopy}</strong> file{preview.wouldCopy === 1 ? '' : 's'}{' '}
                                        will be copied
                                    </div>
                                    {preview.importOnly > 0 && (
                                        <div style={{ color: '#aaa', marginBottom: 8 }}>
                                            <strong>{preview.importOnly}</strong> file
                                            {preview.importOnly === 1 ? '' : 's'} already on disk (import only)
                                        </div>
                                    )}
                                    {nothingToDo && (
                                        <div style={{ color: '#888', marginBottom: 12 }}>Nothing new to sync.</div>
                                    )}
                                    <div style={{ marginTop: 12, marginBottom: 6, fontSize: '0.85em', color: '#888' }}>
                                        New folders to create ({preview.newFolders.length})
                                    </div>
                                    {preview.newFolders.length > 0 ? (
                                        <ul
                                            style={{
                                                margin: 0,
                                                paddingLeft: 18,
                                                maxHeight: 160,
                                                overflowY: 'auto',
                                                fontSize: '0.8em',
                                                fontFamily: 'ui-monospace, monospace',
                                                color: '#b0b0b0',
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            {preview.newFolders.map((f) => (
                                                <li key={f} style={{ wordBreak: 'break-all' }}>
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div style={{ fontSize: '0.85em', color: '#666' }}>—</div>
                                    )}
                                    {preview.skipped > 0 && (
                                        <div style={{ marginTop: 10, fontSize: '0.85em', color: '#888' }}>
                                            Skipped by date / DB: <strong>{preview.skipped}</strong>
                                        </div>
                                    )}
                                    {preview.errors.length > 0 && (
                                        <div style={{ marginTop: 12, maxHeight: 100, overflowY: 'auto' }}>
                                            <div style={{ fontSize: '0.85em', color: '#ffa94d', marginBottom: 4 }}>
                                                Preview warnings:
                                            </div>
                                            <ul
                                                style={{
                                                    margin: 0,
                                                    paddingLeft: 20,
                                                    fontSize: '0.8em',
                                                    color: '#ccc',
                                                }}
                                            >
                                                {preview.errors.slice(0, 8).map((e, i) => (
                                                    <li key={i}>{e}</li>
                                                ))}
                                                {preview.errors.length > 8 && (
                                                    <li>... and {preview.errors.length - 8} more</li>
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isSyncRunning && (
                                <>
                                    <div style={{ marginBottom: 12 }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontSize: '0.85em',
                                                marginBottom: 4,
                                            }}
                                        >
                                            <span>
                                                {phaseLabel}:{' '}
                                                {progress.total > 0
                                                    ? `${progress.current} / ${progress.total}`
                                                    : progress.detail || '…'}
                                            </span>
                                            {progress.total > 0 && (
                                                <span style={{ color: '#888' }}>{pct}%</span>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                height: 8,
                                                backgroundColor: '#333',
                                                borderRadius: 4,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    height: '100%',
                                                    backgroundColor: '#0078d4',
                                                    width: progress.total > 0 ? `${pct}%` : '0%',
                                                    transition: 'width 0.2s ease',
                                                }}
                                            />
                                        </div>
                                    </div>
                                    {progress.detail && progress.phase !== 'done' && (
                                        <div
                                            style={{
                                                fontSize: '0.8em',
                                                color: '#888',
                                                marginBottom: 12,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {progress.detail}
                                        </div>
                                    )}
                                </>
                            )}

                            {isComplete && result && (
                                <div style={{ fontSize: '0.9em', color: '#ccc', lineHeight: 1.8 }}>

                                    <div>
                                        Scanned: <strong>{result.scanned}</strong> files
                                    </div>
                                    <div>
                                        Copied: <strong>{result.copied}</strong> new files
                                    </div>
                                    <div>
                                        Imported: <strong>{result.imported}</strong> into database
                                    </div>
                                    <div>
                                        Skipped: <strong>{result.skipped}</strong> (already synced / in DB)
                                    </div>
                                    <div>
                                        Folders: <strong>{result.folders}</strong> date-folders processed
                                    </div>
                                </div>
                            )}

                            {isComplete && result && result.errors.length > 0 && (
                                <div style={{ marginTop: 12, maxHeight: 120, overflowY: 'auto' }}>
                                    <div style={{ fontSize: '0.85em', color: '#ffa94d', marginBottom: 4 }}>
                                        Errors:
                                    </div>
                                    <ul
                                        style={{
                                            margin: 0,
                                            paddingLeft: 20,
                                            fontSize: '0.8em',
                                            color: '#ccc',
                                        }}
                                    >
                                        {result.errors.slice(0, 10).map((e, i) => (
                                            <li key={i}>{e}</li>
                                        ))}
                                        {result.errors.length > 10 && (
                                            <li>... and {result.errors.length - 10} more</li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div
                    style={{
                        padding: '16px 20px',
                        borderTop: '1px solid #333',
                        background: '#252526',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 10,
                        flexShrink: 0,
                        borderBottomLeftRadius: '8px',
                        borderBottomRightRadius: '8px',
                    }}
                >
                    {!previewLoading && preview && !previewError && !isSyncRunning && !isComplete && (
                        <button
                            type="button"
                            onClick={handleStartSync}
                            style={{
                                padding: '8px 16px',
                                background: '#2ea043',
                                border: 'none',
                                color: '#fff',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontWeight: 500,
                            }}
                        >
                            Start sync
                        </button>
                    )}
                    <button
                        onClick={handleClose}
                        disabled={blockingSync}
                        style={{
                            padding: '8px 16px',
                            background: '#0078d4',
                            border: 'none',
                            color: '#fff',
                            borderRadius: 4,
                            cursor: blockingSync ? 'not-allowed' : 'pointer',
                            fontWeight: 500,
                            opacity: blockingSync ? 0.6 : 1,
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

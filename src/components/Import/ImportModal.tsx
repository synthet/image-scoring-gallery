import React, { useState, useEffect, useRef } from 'react';
import { bridge } from '../../bridge';

interface Props {
    isOpen: boolean;
    folderPath: string;
    onClose: () => void;
    onComplete?: () => void;
}

export const ImportModal: React.FC<Props> = ({ isOpen, folderPath, onClose, onComplete }) => {
    const [current, setCurrent] = useState(0);
    const [total, setTotal] = useState(0);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [added, setAdded] = useState(0);
    const [skipped, setSkipped] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const runRef = useRef(false);

    useEffect(() => {
        if (!isOpen || !folderPath) return;

        runRef.current = true;
        setIsRunning(true);
        setIsComplete(false);
        setError(null);
        setCurrent(0);
        setTotal(0);
        setCurrentPath('');
        setAdded(0);
        setSkipped(0);
        setErrors([]);

        const cleanupProgress = bridge.onImportProgress((data) => {
            if (runRef.current) {
                setCurrent(data.current);
                setTotal(data.total);
                setCurrentPath(data.path ?? '');
            }
        });

        bridge.importRun(folderPath)
            .then((result) => {
                if (runRef.current) {
                    setAdded(result.added);
                    setSkipped(result.skipped);
                    setErrors(result.errors);
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

        return () => {
            runRef.current = false;
            cleanupProgress();
        };
    }, [isOpen, folderPath]);

    const handleClose = () => {
        if (isComplete && onComplete) {
            onComplete();
        }
        onClose();
    };

    const truncatedPath = folderPath.length > 60 ? folderPath.slice(0, 57) + '...' : folderPath;
    const currentFileName = currentPath ? currentPath.split(/[/\\]/).pop() ?? '' : '';

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: '#1e1e1e', borderRadius: '8px',
                width: '500px', maxWidth: '90vw',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                border: '1px solid #444',
                color: '#e0e0e0'
            }}>
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 600 }}>Import folder</h2>
                    <button
                        onClick={handleClose}
                        disabled={isRunning}
                        style={{
                            background: 'none', border: 'none', color: '#888', cursor: isRunning ? 'not-allowed' : 'pointer',
                            fontSize: '1.5em', padding: 0, lineHeight: 1, opacity: isRunning ? 0.5 : 1
                        }}
                        title="Close"
                    >&times;</button>
                </div>

                <div style={{ padding: '24px 20px' }}>
                    <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: 16, wordBreak: 'break-all' }}>
                        {truncatedPath}
                    </div>

                    {error ? (
                        <div style={{ color: '#ff6b6b', padding: '12px', background: 'rgba(255,107,107,0.1)', borderRadius: 4, border: '1px solid rgba(255,107,107,0.3)' }}>
                            {error}
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', marginBottom: 4 }}>
                                    <span>{isRunning ? `Processing ${current} of ${total}` : isComplete ? `Completed: ${total} files` : 'Preparing...'}</span>
                                    {total > 0 && (
                                        <span style={{ color: '#888' }}>
                                            {Math.round((current / total) * 100)}%
                                        </span>
                                    )}
                                </div>
                                <div style={{
                                    height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden'
                                }}>
                                    <div style={{
                                        height: '100%', backgroundColor: '#0078d4', width: total > 0 ? `${(current / total) * 100}%` : '0%',
                                        transition: 'width 0.2s ease'
                                    }} />
                                </div>
                            </div>

                            {currentFileName && isRunning && (
                                <div style={{ fontSize: '0.8em', color: '#888', marginBottom: 12 }}>
                                    Current: {currentFileName}
                                </div>
                            )}

                            {isComplete && (
                                <div style={{ fontSize: '0.9em', color: '#aaa' }}>
                                    Added: {added} &middot; Skipped: {skipped}
                                </div>
                            )}

                            {isComplete && errors.length > 0 && (
                                <div style={{ marginTop: 12, maxHeight: 120, overflowY: 'auto' }}>
                                    <div style={{ fontSize: '0.85em', color: '#ffa94d', marginBottom: 4 }}>Errors:</div>
                                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8em', color: '#ccc' }}>
                                        {errors.slice(0, 10).map((e, i) => (
                                            <li key={i}>{e}</li>
                                        ))}
                                        {errors.length > 10 && (
                                            <li>... and {errors.length - 10} more</li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{
                    padding: '16px 20px', borderTop: '1px solid #333', background: '#252526',
                    display: 'flex', justifyContent: 'flex-end', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px'
                }}>
                    <button
                        onClick={handleClose}
                        disabled={isRunning}
                        style={{
                            padding: '8px 16px', background: '#0078d4', border: 'none', color: '#fff', borderRadius: 4,
                            cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: isRunning ? 0.6 : 1
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

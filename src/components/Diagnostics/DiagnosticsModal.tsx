import React, { useState, useEffect } from 'react';
import type { DiagnosticsReport, ProcessMemorySnapshot } from '../../electron.d';
import { useConnectionStore } from '../../store/useConnectionStore';
import toggleStyles from '../../styles/toggle.module.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const DiagnosticsModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null);
    const [rendererMemory, setRendererMemory] = useState<ProcessMemorySnapshot | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { isWebSocketEnabled, toggleWebSocket } = useConnectionStore();


    useEffect(() => {
        if (isOpen) {
            loadDiagnostics();
        }
    }, [isOpen]);

    const loadDiagnostics = async () => {
        setIsLoading(true);
        setError(null);
        try {
            if (window.electron) {
                const [diagData, rendMem] = await Promise.all([
                    window.electron.getDiagnostics(),
                    window.electron.getProcessMemoryInfo ? window.electron.getProcessMemoryInfo() : Promise.resolve(null)
                ]);
                setDiagnostics(diagData);
                setRendererMemory(rendMem);
            }
        } catch (err: unknown) {
            console.error('Failed to load diagnostics:', err);
            setError(err instanceof Error ? err.message : 'Failed to load diagnostics.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const formatBytes = (kb: number | undefined) => {
        if (kb === undefined || kb === null || isNaN(kb)) return 'N/A';
        if (kb === 0) return '0 B';
        
        const bytes = kb * 1024;
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const renderStatus = (connected: boolean, disabled?: boolean) => (
        <span style={{ 
            color: disabled ? '#888' : (connected ? '#4caf50' : '#f44336'),
            fontWeight: 'bold',
            marginLeft: '8px',
            fontStyle: disabled ? 'italic' : 'normal'
        }}>
            {disabled ? '○ Manually Disabled' : (connected ? '● Connected' : '○ Disconnected')}
        </span>
    );

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
                width: '600px', maxWidth: '95vw', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                border: '1px solid #444',
                color: '#e0e0e0'
            }}>
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 600 }}>System Diagnostics</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.5em', padding: 0, lineHeight: 1 }}
                        title="Close"
                    >&times;</button>
                </div>

                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    {isLoading ? (
                        <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>Gathering diagnostics...</div>
                    ) : error ? (
                        <div style={{ color: '#ff6b6b', padding: '12px', background: 'rgba(255,107,107,0.1)', borderRadius: 4, border: '1px solid rgba(255,107,107,0.3)' }}>{error}</div>
                    ) : diagnostics ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Connectivity Section */}
                            <section>
                                <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '12px', color: '#0078d4' }}>Connectivity</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px' }}>
                                    <div style={{ color: '#888' }}>Database:</div>
                                    <div>
                                        <code style={{ background: '#2d2d2d', padding: '2px 4px', borderRadius: '3px' }}>{diagnostics.database.engine}</code>
                                        {renderStatus(diagnostics.database.connected)}
                                    </div>
                                    <div style={{ color: '#888' }}>DB Host/Path:</div>
                                    <div style={{ fontSize: '0.9em', wordBreak: 'break-all' }}>{diagnostics.database.database}</div>
                                    <div style={{ color: '#888' }}>Python API:</div>
                                    <div>
                                        <code style={{ background: '#2d2d2d', padding: '2px 4px', borderRadius: '3px' }}>{diagnostics.api.url}</code>
                                        {renderStatus(diagnostics.api.connected)}
                                    </div>

                                    <div style={{ color: '#888', marginTop: '12px' }}>Real-time Updates:</div>
                                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '0.9em', color: isWebSocketEnabled ? '#4caf50' : '#888' }}>
                                            {isWebSocketEnabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                        <button
                                            role="switch"
                                            aria-checked={isWebSocketEnabled}
                                            aria-label="Toggle WebSocket connection"
                                            className={toggleStyles.toggle}
                                            onClick={toggleWebSocket}
                                            style={{
                                                '--accent': '#0078d4',
                                                '--focus-ring': '0 0 0 2px rgba(0, 120, 212, 0.4)',
                                                '--focus-offset': '2px'
                                            } as React.CSSProperties}
                                        >
                                            <span className={toggleStyles.thumb} />
                                        </button>
                                        <div style={{ fontSize: '0.8em', color: '#666', marginLeft: '8px' }}>
                                            Uses WebSockets to refresh the gallery when backend events occur.
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Software Versions Section */}
                            <section>
                                <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '12px', color: '#0078d4' }}>Software Versions</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px' }}>
                                    <div style={{ color: '#888' }}>Electron:</div>
                                    <div>{diagnostics.versions.electron}</div>
                                    <div style={{ color: '#888' }}>Node.js:</div>
                                    <div>{diagnostics.versions.node}</div>
                                    <div style={{ color: '#888' }}>Chrome:</div>
                                    <div>{diagnostics.versions.chrome}</div>
                                    <div style={{ color: '#888' }}>V8:</div>
                                    <div>{diagnostics.versions.v8}</div>
                                </div>
                            </section>

                            {/* OS Information Section */}
                            <section>
                                <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '12px', color: '#0078d4' }}>Host Operating System</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px' }}>
                                    <div style={{ color: '#888' }}>Platform:</div>
                                    <div>{diagnostics.os.platform} ({diagnostics.os.arch})</div>
                                    <div style={{ color: '#888' }}>Release:</div>
                                    <div>{diagnostics.os.release}</div>
                                    <div style={{ color: '#888' }}>Uptime:</div>
                                    <div>{(diagnostics.os.uptime / 3600).toFixed(2)} hours</div>
                                </div>
                            </section>

                            {/* Memory Usage Section */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <section>
                                    <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '12px', color: '#0078d4' }}>Main Process</h3>
                                    {diagnostics.memory ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '4px', fontSize: '0.9em' }}>
                                            <div style={{ color: '#888' }}>Working Set:</div>
                                            <div>{formatBytes(diagnostics.memory.workingSetSize)}</div>
                                            <div style={{ color: '#888' }}>Peak Set:</div>
                                            <div>{formatBytes(diagnostics.memory.peakWorkingSetSize)}</div>
                                            {diagnostics.memory.privateBytes && (
                                                <>
                                                    <div style={{ color: '#888' }}>Private:</div>
                                                    <div>{formatBytes(diagnostics.memory.privateBytes)}</div>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888', fontSize: '0.9em' }}>Not available</div>
                                    )}
                                </section>

                                <section>
                                    <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', marginBottom: '12px', color: '#0078d4' }}>Renderer Process</h3>
                                    {rendererMemory ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '4px', fontSize: '0.9em' }}>
                                            <div style={{ color: '#888' }}>Working Set:</div>
                                            <div>{formatBytes(rendererMemory.workingSetSize)}</div>
                                            <div style={{ color: '#888' }}>Peak Set:</div>
                                            <div>{formatBytes(rendererMemory.peakWorkingSetSize)}</div>
                                            {rendererMemory.privateBytes && (
                                                <>
                                                    <div style={{ color: '#888' }}>Private:</div>
                                                    <div>{formatBytes(rendererMemory.privateBytes)}</div>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888', fontSize: '0.9em' }}>Not available</div>
                                    )}
                                </section>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div style={{
                    padding: '16px 20px', borderTop: '1px solid #333', background: '#252526',
                    display: 'flex', justifyContent: 'flex-end', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px'
                }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '8px 16px', background: '#333', border: '1px solid #555', color: '#ccc', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
                    >
                        Close
                    </button>
                    <button
                        onClick={loadDiagnostics}
                        style={{ padding: '8px 16px', background: '#0078d4', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', fontWeight: 500, marginLeft: '12px' }}
                    >
                        Refresh
                    </button>
                </div>
            </div>
        </div>
    );
};

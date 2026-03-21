import { useState } from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useProcessingStore } from '../../store/useProcessingStore';

interface ProcessingControlsProps {
    folderPath: string | null;
    onBack: () => void;
}

export function ProcessingControls({ folderPath, onBack }: ProcessingControlsProps) {
    const [busy, setBusy] = useState(false);
    const addNotification = useNotificationStore((s) => s.addNotification);
    const actor = useProcessingStore(s => s.actor);
    const setActor = useProcessingStore(s => s.setActor);
    const appendLog = useProcessingStore(s => s.appendLog);

    const logEntry = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
        appendLog({ ts: new Date().toISOString(), level, source: 'system', message });
    };

    const handleRunAll = async () => {
        if (!folderPath || busy) return;
        setBusy(true);
        try {
            await window.electron.api.submitPipeline({
                input_path: folderPath,
                operations: ['indexing', 'metadata', 'score', 'tag', 'cluster'],
                skip_existing: true,
            });
            addNotification('Pipeline submitted', 'success');
            logEntry(`Run All Pending → ${folderPath}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addNotification(`Pipeline submit failed: ${msg}`, 'error');
            logEntry(`Run All Pending failed: ${msg}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleStopAll = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await Promise.allSettled([
                window.electron.api.stopScoring(),
                window.electron.api.stopTagging(),
                window.electron.api.stopClustering(),
            ]);
            addNotification('Stop signal sent', 'info');
            logEntry('Stop All → stop signals sent');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addNotification(`Stop failed: ${msg}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 14px', borderBottom: '1px solid #333', background: '#141414',
        }}>
            <button
                onClick={onBack}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.85em' }}
            >
                ← Gallery
            </button>

            <div style={{ width: 1, height: 20, background: '#333' }} />

            <button
                onClick={handleRunAll}
                disabled={!folderPath || busy}
                style={{
                    background: !folderPath || busy ? '#333' : '#2a5faa',
                    border: 'none', color: !folderPath || busy ? '#555' : '#eee',
                    borderRadius: 5, padding: '5px 14px', fontSize: '0.85em',
                    cursor: !folderPath || busy ? 'not-allowed' : 'pointer', fontWeight: 600,
                }}
            >
                Run All Pending
            </button>

            <button
                onClick={handleStopAll}
                disabled={busy}
                style={{
                    background: busy ? '#333' : '#7a2020',
                    border: 'none', color: busy ? '#555' : '#eee',
                    borderRadius: 5, padding: '5px 14px', fontSize: '0.85em',
                    cursor: busy ? 'not-allowed' : 'pointer',
                }}
            >
                Stop All
            </button>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: '0.8em', color: '#888' }}>Actor:</label>
                <input
                    value={actor}
                    onChange={(e) => setActor(e.target.value)}
                    placeholder="your name"
                    style={{
                        background: '#111', border: '1px solid #444', color: '#eee',
                        borderRadius: 4, padding: '4px 8px', fontSize: '0.82em', width: 120,
                    }}
                />
            </div>
        </div>
    );
}

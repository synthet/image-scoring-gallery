import { useState } from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useProcessingStore, PHASE_LABELS, BACKEND_PHASE_CODE } from '../../store/useProcessingStore';
import type { ProcessingPhaseState } from '../../store/useProcessingStore';

interface ProcessingPhaseCardProps {
    phase: ProcessingPhaseState;
    folderPath: string;
    actor: string;
}

const STATUS_COLOR: Record<string, string> = {
    not_started: '#555',
    queued: '#888',
    running: '#4a9eff',
    done: '#4caf50',
    skipped: '#f0a500',
    failed: '#e05050',
};

export function ProcessingPhaseCard({ phase, folderPath, actor }: ProcessingPhaseCardProps) {
    const [skipReason, setSkipReason] = useState('');
    const [showSkipInput, setShowSkipInput] = useState(false);
    const [busy, setBusy] = useState(false);
    const addNotification = useNotificationStore((s) => s.addNotification);
    const updatePhase = useProcessingStore((s) => s.updatePhase);
    const appendLog = useProcessingStore((s) => s.appendLog);

    const phaseCode = BACKEND_PHASE_CODE[phase.phase];
    const label = PHASE_LABELS[phase.phase];
    const pct = phase.total > 0 ? Math.round((phase.processed / phase.total) * 100) : 0;

    const logEntry = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
        appendLog({ ts: new Date().toISOString(), level, source: 'system', message });
    };

    const handleRun = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await window.electron.api.submitPipeline({
                input_path: folderPath,
                operations: [phaseCode],
                skip_existing: true,
            });
            logEntry(`${label}: submitted`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addNotification(`Failed to run ${label}: ${msg}`, 'error');
            logEntry(`${label}: run failed — ${msg}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleSkip = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await window.electron.api.skipPipelinePhase({
                input_path: folderPath,
                phase_code: phaseCode,
                reason: skipReason || undefined,
                actor: actor || undefined,
            });
            updatePhase(phase.phase, { status: 'skipped', canRun: false, canSkip: false, canRetry: true });
            logEntry(`${label}: skipped${skipReason ? ` (${skipReason})` : ''}`);
            setShowSkipInput(false);
            setSkipReason('');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addNotification(`Failed to skip ${label}: ${msg}`, 'error');
            logEntry(`${label}: skip failed — ${msg}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleRetry = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await window.electron.api.retryPipelinePhase({
                input_path: folderPath,
                phase_code: phaseCode,
                actor: actor || undefined,
            });
            updatePhase(phase.phase, { status: 'queued', canRun: false, canSkip: false, canRetry: false });
            logEntry(`${label}: retry submitted`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addNotification(`Failed to retry ${label}: ${msg}`, 'error');
            logEntry(`${label}: retry failed — ${msg}`, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{
            background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9em' }}>{label}</span>
                <span style={{
                    fontSize: '0.75em', fontWeight: 600,
                    color: STATUS_COLOR[phase.status] ?? '#888',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                    {phase.status.replace('_', ' ')}
                </span>
            </div>

            {/* Progress bar */}
            {phase.total > 0 && (
                <div>
                    <div style={{ background: '#333', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                        <div style={{
                            background: STATUS_COLOR[phase.status] ?? '#4a9eff',
                            width: `${pct}%`, height: '100%', transition: 'width 0.3s',
                        }} />
                    </div>
                    <div style={{ fontSize: '0.72em', color: '#666', marginTop: 3 }}>
                        {phase.processed} / {phase.total} ({pct}%)
                    </div>
                </div>
            )}

            {/* Message */}
            {phase.message && (
                <div style={{ fontSize: '0.78em', color: '#888' }}>{phase.message}</div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                    onClick={handleRun}
                    disabled={!phase.canRun || busy}
                    style={btnStyle(!phase.canRun || busy, 'primary')}
                >
                    Run
                </button>
                <button
                    onClick={() => setShowSkipInput((v) => !v)}
                    disabled={!phase.canSkip || busy}
                    style={btnStyle(!phase.canSkip || busy, 'neutral')}
                >
                    Skip
                </button>
                <button
                    onClick={handleRetry}
                    disabled={!phase.canRetry || busy}
                    style={btnStyle(!phase.canRetry || busy, 'neutral')}
                >
                    Retry
                </button>
            </div>

            {/* Skip reason input */}
            {showSkipInput && (
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        value={skipReason}
                        onChange={(e) => setSkipReason(e.target.value)}
                        placeholder="Reason (optional)"
                        style={{
                            flex: 1, background: '#111', border: '1px solid #444',
                            color: '#eee', borderRadius: 4, padding: '4px 8px', fontSize: '0.82em',
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSkip(); }}
                    />
                    <button onClick={handleSkip} disabled={busy} style={btnStyle(busy, 'danger')}>
                        Confirm Skip
                    </button>
                </div>
            )}
        </div>
    );
}

function btnStyle(disabled: boolean, variant: 'primary' | 'neutral' | 'danger') {
    const colors = {
        primary: disabled ? '#333' : '#2a5faa',
        neutral: disabled ? '#333' : '#3a3a3a',
        danger: disabled ? '#333' : '#7a2020',
    };
    return {
        background: colors[variant],
        border: 'none',
        color: disabled ? '#555' : '#eee',
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: '0.8em',
        cursor: disabled ? 'not-allowed' : 'pointer',
    } as const;
}

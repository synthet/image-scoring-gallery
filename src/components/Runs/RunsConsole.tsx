import { useEffect, useRef } from 'react';
import type { WorkerLogEntry } from '../../store/useRunsStore';

interface RunsConsoleProps {
    entries: WorkerLogEntry[];
    onClear: () => void;
}

const COLORS = {
    info: '#8bc34a',
    warn: '#ff9800',
    error: '#f44336',
};

export function RunsConsole({ entries, onClear }: RunsConsoleProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new log
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries.length]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a0a', borderTop: '1px solid #333' }}>
            <div style={{
                padding: '4px 10px', background: '#1a1a1a', borderBottom: '1px solid #333',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <span style={{ fontSize: '0.85em', color: '#888', fontWeight: 600 }}>Console Output</span>
                <button
                    onClick={onClear}
                    style={{
                        background: 'none', border: '1px solid #444', color: '#aaa',
                        borderRadius: 3, cursor: 'pointer', fontSize: '0.75em', padding: '2px 8px'
                    }}
                >
                    Clear
                </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, fontFamily: 'monospace', fontSize: '13px' }}>
                {entries.length === 0 && (
                    <div style={{ color: '#444', fontStyle: 'italic' }}>No logs yet...</div>
                )}
                {entries.map((req, i) => {
                    const timeStr = new Date(req.ts).toLocaleTimeString('en-US', {
                        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
                    });
                    const color = COLORS[req.level];
                    return (
                        <div key={i} style={{ marginBottom: 4, lineHeight: 1.4, wordBreak: 'break-word' }}>
                            <span style={{ color: '#666', marginRight: 8 }}>[{timeStr}]</span>
                            <span style={{ color: '#999', marginRight: 8, display: 'inline-block', width: 60 }}>
                                [{req.source}]
                            </span>
                            <span style={{ color }}>{req.message}</span>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

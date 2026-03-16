import { useEffect, useRef } from 'react';
import type { WorkerLogEntry } from '../../store/useProcessingStore';

interface ProcessingConsoleProps {
    entries: WorkerLogEntry[];
    onClear: () => void;
}

const LEVEL_COLOR: Record<WorkerLogEntry['level'], string> = {
    info: '#ccc',
    warn: '#f0a500',
    error: '#e05050',
};

export function ProcessingConsole({ entries, onClear }: ProcessingConsoleProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries.length]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderBottom: '1px solid #333', flexShrink: 0,
            }}>
                <span style={{ fontSize: '0.8em', color: '#888', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Worker Log
                </span>
                <button
                    onClick={onClear}
                    style={{
                        background: 'none', border: 'none', color: '#666', cursor: 'pointer',
                        fontSize: '0.75em', padding: '2px 6px',
                    }}
                >
                    Clear
                </button>
            </div>
            <div style={{
                flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78em',
                padding: '6px 10px', background: '#0d0d0d', lineHeight: 1.5,
            }}>
                {entries.length === 0 ? (
                    <div style={{ color: '#444', fontStyle: 'italic' }}>No log entries yet.</div>
                ) : (
                    entries.map((entry, i) => (
                        <div key={i} style={{ color: LEVEL_COLOR[entry.level], marginBottom: 1 }}>
                            <span style={{ color: '#555', marginRight: 8 }}>
                                {new Date(entry.ts).toLocaleTimeString()}
                            </span>
                            <span style={{ color: '#666', marginRight: 8 }}>[{entry.source}]</span>
                            {entry.message}
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

import React, { useState } from 'react';
import { bridge } from '../../bridge';

interface LightModeConfigProps {
    open: boolean;
    initialPath: string;
    onClose: () => void;
    onSaved: (newRoot: string) => void;
}

export const LightModeConfig: React.FC<LightModeConfigProps> = ({
    open,
    initialPath,
    onClose,
    onSaved,
}) => {
    const [pathInput, setPathInput] = useState(initialPath);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    React.useEffect(() => {
        if (open) {
            setPathInput(initialPath);
            setError(null);
        }
    }, [open, initialPath]);

    if (!open) return null;

    const handleBrowse = async () => {
        try {
            const picked = await bridge.selectDirectory();
            if (picked) setPathInput(picked);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : 'Folder picker failed');
        }
    };

    const handleSave = async () => {
        const trimmed = pathInput.trim();
        if (!trimmed) {
            setError('Enter a folder path');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await bridge.saveConfig({ lightModeRootFolder: trimmed });
            onSaved(trimmed);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save config');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="light-mode-config-title"
        >
            <div
                style={{
                    background: '#2a2a2a',
                    border: '1px solid #555',
                    borderRadius: 8,
                    padding: 24,
                    minWidth: 420,
                    maxWidth: '90vw',
                    color: '#eee',
                }}
            >
                <h2 id="light-mode-config-title" style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>
                    Folder mode root
                </h2>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#aaa', lineHeight: 1.4 }}>
                    Only folders under this path can be browsed. Paths are stored in <code style={{ color: '#7cb7ff' }}>config.json</code>.
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                        type="text"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        placeholder="e.g. D:\Photos"
                        style={{
                            flex: 1,
                            padding: '8px 10px',
                            background: '#1a1a1a',
                            border: '1px solid #555',
                            borderRadius: 4,
                            color: '#fff',
                            fontSize: 13,
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => void handleBrowse()}
                        style={{
                            padding: '8px 14px',
                            background: '#444',
                            border: '1px solid #666',
                            borderRadius: 4,
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        Browse…
                    </button>
                </div>
                {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            padding: '8px 16px',
                            background: 'transparent',
                            border: '1px solid #666',
                            borderRadius: 4,
                            color: '#ccc',
                            cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        style={{
                            padding: '8px 16px',
                            background: '#007acc',
                            border: 'none',
                            borderRadius: 4,
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

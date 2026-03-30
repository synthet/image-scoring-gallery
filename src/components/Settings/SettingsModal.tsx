import React, { useState, useEffect } from 'react';
import { bridge } from '../../bridge';
import { SelectionSettings } from './SelectionSettings';

interface AppConfig {
    selection?: {
        smartCoverEnabled?: boolean;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadConfig();
        }
    }, [isOpen]);

    const loadConfig = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const currentConfig = await bridge.getConfig();
            setConfig(currentConfig);
        } catch (err: unknown) {
            console.error('Failed to load config:', err);
            setError('Failed to load configuration.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!config) return;
        setIsSaving(true);
        setError(null);
        try {
            await bridge.saveConfig(config);
            onClose();
            // Dispatch a custom event so other components could know config changed
            window.dispatchEvent(new CustomEvent('config-updated', { detail: config }));
        } catch (err: unknown) {
            console.error('Failed to save config:', err);
            setError('Failed to save configuration.');
        } finally {
            setIsSaving(false);
        }
    };

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
                width: '500px', maxWidth: '90vw', maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                border: '1px solid #444',
                color: '#e0e0e0'
            }}>
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 600 }}>Preferences</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.5em', padding: 0, lineHeight: 1 }}
                        title="Close"
                    >&times;</button>
                </div>

                <div style={{ padding: '24px 20px', overflowY: 'auto', flex: 1 }}>
                    {isLoading ? (
                        <div style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>Loading settings...</div>
                    ) : error ? (
                        <div style={{ color: '#ff6b6b', padding: '12px', background: 'rgba(255,107,107,0.1)', borderRadius: 4, border: '1px solid rgba(255,107,107,0.3)' }}>{error}</div>
                    ) : config ? (
                        <SelectionSettings
                            smartCoverEnabled={Boolean(config.selection?.smartCoverEnabled)}
                            onSmartCoverChange={(enabled) => {
                                setConfig((prev) => {
                                    if (!prev) return prev;
                                    return {
                                        ...prev,
                                        selection: {
                                            ...(prev.selection ?? {}),
                                            smartCoverEnabled: enabled,
                                        },
                                    };
                                });
                            }}
                        />
                    ) : (
                        <div style={{ color: '#aaa', textAlign: 'center', padding: '40px 20px' }}>
                            <div style={{ fontSize: '1.2em', marginBottom: '10px' }}>No configurable preferences.</div>
                        </div>
                    )}
                </div>

                <div style={{
                    padding: '16px 20px', borderTop: '1px solid #333', background: '#252526',
                    display: 'flex', justifyContent: 'flex-end', gap: '12px', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px'
                }}>
                    <button
                        onClick={onClose} disabled={isSaving}
                        style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #555', color: '#ccc', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave} disabled={isLoading || isSaving || !!error}
                        style={{ padding: '8px 16px', background: '#0078d4', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', opacity: (isLoading || isSaving || !!error) ? 0.6 : 1, fontWeight: 500 }}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

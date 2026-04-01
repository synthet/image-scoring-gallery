import React, { useState } from 'react';
import { bridge } from '../../bridge';
import styles from './FsGallery.module.css';

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
            className={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="light-mode-config-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className={styles.modalCard}>
                <h2 id="light-mode-config-title" className={styles.modalTitle}>
                    Folder Mode Root
                </h2>
                <p className={styles.modalDescription}>
                    Only folders under this root can be browsed in Folder Mode.
                    This setting is persisted in <code>config.json</code>.
                </p>
                <div className={styles.modalInputRow}>
                    <input
                        type="text"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        placeholder="e.g. D:\Photos"
                        className={styles.modalInput}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSave();
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => void handleBrowse()}
                        className={styles.browseButton}
                    >
                        Browse…
                    </button>
                </div>
                {error && <div className={styles.modalError}>{error}</div>}
                <div className={styles.modalActions}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className={styles.cancelButton}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className={styles.saveButton}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

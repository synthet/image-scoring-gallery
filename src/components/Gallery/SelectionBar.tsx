import { useEffect, useState } from 'react';
import { bridge } from '../../bridge';
import { resolveSelection, selectedCount, type GridSelection } from '../../utils/gridSelection';
import { pickServerFilesystemPath } from '../../utils/pickServerFilesystemPath';
import styles from './SelectionBar.module.css';

interface SelectablePhoto {
    id: number;
    file_path?: string | null;
    win_path?: string | null;
}

interface SelectionBarProps<T extends SelectablePhoto> {
    selection: GridSelection;
    /** Photos in the current view, loaded or not. */
    total: number;
    loaded: readonly T[];
    /** The grid's own query, so select-all covers the same photos the grid would show. */
    fetchPage: (offset: number, limit: number) => Promise<T[]>;
    onClear: () => void;
}

/** Shown while photos are selected (#239): the count, the bulk action, and the way out. */
export function SelectionBar<T extends SelectablePhoto>({ selection, total, loaded, fetchPage, onClear }: SelectionBarProps<T>) {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => bridge.onExportOriginalsProgress(setProgress), []);

    const count = selectedCount(selection, total);
    if (count === 0 && !running) return null;

    const exportSelected = async () => {
        setRunning(true);
        setError(null);
        try {
            const photos = await resolveSelection(selection, loaded, fetchPage);
            const paths = photos.map((p) => pickServerFilesystemPath(p.file_path, p.win_path)).filter(Boolean);
            const result = await bridge.exportOriginals(paths);
            if (result && !result.cancelled && result.failed.length === 0) onClear();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Export failed');
        } finally {
            setRunning(false);
            setProgress(null);
        }
    };

    return (
        <div className={styles.bar} role="toolbar" aria-label="Selected photos">
            <span className={styles.count} aria-live="polite">
                {running && progress ? `Exporting ${progress.current} of ${progress.total}` : `${count} selected`}
            </span>
            {error && <span className={styles.error} role="alert">{error}</span>}
            {running ? (
                <button type="button" className={styles.action} onClick={() => void bridge.exportOriginalsCancel()}>
                    Cancel
                </button>
            ) : (
                <>
                    <button type="button" className={styles.action} onClick={() => void exportSelected()}>
                        Export originals…
                    </button>
                    <button type="button" className={styles.action} onClick={onClear}>
                        Clear
                    </button>
                </>
            )}
        </div>
    );
}

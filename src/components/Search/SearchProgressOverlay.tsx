import { X } from 'lucide-react';
import styles from './SearchProgressOverlay.module.css';

interface SearchProgressOverlayProps {
    query: string;
    onCancel: () => void;
}

export function SearchProgressOverlay({ query, onCancel }: SearchProgressOverlayProps) {
    return (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="search-progress-title">
            <div className={styles.card}>
                <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={onCancel}
                    aria-label="Cancel search"
                    title="Cancel search"
                >
                    <X size={18} />
                </button>
                <p id="search-progress-title" className={styles.title}>
                    Searching for <span className={styles.query}>&ldquo;{query}&rdquo;</span>…
                </p>
                <p className={styles.hint}>
                    This may take a moment. The first search can be slower while the CLIP model loads.
                </p>
                <div className={styles.track} aria-hidden>
                    <div className={styles.bar} />
                </div>
            </div>
        </div>
    );
}

import { ImageOff, Loader2 } from 'lucide-react';
import styles from './GalleryGrid.module.css';

function extensionLabel(fileName?: string): string | null {
    if (!fileName) return null;
    const base = fileName.trim().split(/[/\\]/).pop() || '';
    const dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) return null;
    const ext = base.slice(dot + 1).toUpperCase();
    return ext.length > 0 && ext.length <= 8 ? ext : null;
}

export function ThumbnailPlaceholder({
    title = 'No preview',
    'aria-label': ariaLabel,
    fileName,
    variant = 'missing',
}: {
    title?: string;
    'aria-label'?: string;
    /** When set, shows a format badge (e.g. NEF) under the icon. */
    fileName?: string;
    /** `loading` keeps the same fancy chrome with a spinner instead of ImageOff. */
    variant?: 'missing' | 'loading';
}) {
    const format = extensionLabel(fileName);
    const isLoading = variant === 'loading';
    const label = isLoading ? (title === 'No preview' ? 'Loading…' : title) : title;

    return (
        <div
            className={styles.thumbnailPlaceholder}
            title={label}
            role="img"
            aria-label={ariaLabel ?? label}
            aria-busy={isLoading || undefined}
        >
            <div className={styles.thumbnailPlaceholderGlow} aria-hidden />
            <div className={styles.thumbnailPlaceholderPattern} aria-hidden />
            <div className={styles.thumbnailPlaceholderContent}>
                <div className={styles.thumbnailPlaceholderBadge}>
                    {isLoading ? (
                        <Loader2
                            className={`${styles.thumbnailPlaceholderIcon} ${styles.thumbnailLoadingSpinner}`}
                            size={22}
                            strokeWidth={1.5}
                            aria-hidden
                        />
                    ) : (
                        <ImageOff
                            className={styles.thumbnailPlaceholderIcon}
                            size={22}
                            strokeWidth={1.5}
                            aria-hidden
                        />
                    )}
                </div>
                <span className={styles.thumbnailPlaceholderLabel}>{label}</span>
                {format ? (
                    <span className={styles.thumbnailPlaceholderFormat}>{format}</span>
                ) : null}
            </div>
        </div>
    );
}

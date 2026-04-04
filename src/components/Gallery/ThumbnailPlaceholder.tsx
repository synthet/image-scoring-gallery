import React from 'react';
import { ImageOff } from 'lucide-react';
import styles from './GalleryGrid.module.css';

export function ThumbnailPlaceholder({
    title = 'No preview',
    'aria-label': ariaLabel,
}: {
    title?: string;
    'aria-label'?: string;
}) {
    return (
        <div
            className={styles.thumbnailPlaceholder}
            title={title}
            role="img"
            aria-label={ariaLabel ?? title}
        >
            <ImageOff className={styles.thumbnailPlaceholderIcon} size={40} strokeWidth={1.25} aria-hidden />
        </div>
    );
}

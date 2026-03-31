import React, { useEffect, useState, useCallback } from 'react';
import styles from './GalleryGrid.module.css';
import { isWebSafe, isRaw } from '../../utils/imageFormats';
import { toMediaUrl } from '../../utils/mediaUrl';
import { getCachedRawPreviewUrl, setCachedRawPreviewUrl } from '../../utils/galleryRawPreviewCache';
import { withRawPreviewSlot } from '../../utils/rawPreviewLimiter';

export interface GalleryThumbProps {
    fileName: string;
    filePath: string;
    thumbnailPath?: string;
    className?: string;
    /** Applied to the <img> when rendering a raster preview */
    imageStyle?: React.CSSProperties;
    alt: string;
}

/**
 * Grid thumbnail: JPEG/PNG use media://; RAW uses embedded preview extraction (same strategy as ImageViewer).
 */
function basenameFromPath(pathStr: string): string {
    const s = pathStr.replace(/[/\\]+$/, '');
    return s.split(/[/\\]/).pop() || '';
}

export const GalleryThumbnail: React.FC<GalleryThumbProps> = ({
    fileName,
    filePath,
    thumbnailPath,
    className,
    imageStyle,
    alt,
}) => {
    /** Prefer explicit name; otherwise infer from path so RAW/WEB checks work in folder mode. */
    const displayName = (fileName?.trim() || basenameFromPath(filePath)).trim() || 'image';

    const [src, setSrc] = useState<string | null>(null);
    const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

    const loadRaw = useCallback(async (pathForIpc: string, cancelledRef: { current: boolean }) => {
            const cached = getCachedRawPreviewUrl(pathForIpc);
            if (cached) {
                if (!cancelledRef.current) {
                    setSrc(cached);
                    setPhase('ready');
                }
                return;
            }
            setPhase('loading');
            try {
                const { nefViewer } = await import('../../utils/nefViewer');
                const blob = await withRawPreviewSlot(() => nefViewer.extractWithFallback(pathForIpc));
                if (cancelledRef.current) return;
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    setCachedRawPreviewUrl(pathForIpc, url);
                    setSrc(url);
                    setPhase('ready');
                } else {
                    setPhase('error');
                }
            } catch {
                if (!cancelledRef.current) setPhase('error');
            }
        },
        []
    );

    useEffect(() => {
        const cancelledRef = { current: false };

        const run = async () => {
            setPhase('idle');
            setSrc(null);

            const thumb = thumbnailPath?.trim();
            const raw = filePath?.trim();
            if (!raw && !thumb) {
                setPhase('error');
                return;
            }

            // Prefer generated thumbnail file (usually JPEG) when present
            if (thumb) {
                const lower = thumb.toLowerCase();
                const looksRasterThumb =
                    lower.endsWith('.jpg') ||
                    lower.endsWith('.jpeg') ||
                    lower.endsWith('.png') ||
                    lower.endsWith('.webp');
                if (looksRasterThumb || !isRaw(displayName)) {
                    if (!cancelledRef.current) {
                        setSrc(toMediaUrl(thumb));
                        setPhase('ready');
                    }
                    return;
                }
            }

            if (isWebSafe(displayName) && raw) {
                if (!cancelledRef.current) {
                    setSrc(toMediaUrl(raw));
                    setPhase('ready');
                }
                return;
            }

            if (isRaw(displayName) && raw) {
                setPhase('loading');
                await loadRaw(raw, cancelledRef);
                return;
            }

            // TIFF / HEIC / other: try media:// once; browser may still fail
            if (raw) {
                if (!cancelledRef.current) {
                    setSrc(toMediaUrl(raw));
                    setPhase('ready');
                }
            } else {
                setPhase('error');
            }
        };

        void run();

        return () => {
            cancelledRef.current = true;
        };
    }, [displayName, filePath, thumbnailPath, loadRaw]);

    const onImgError = useCallback(() => {
        // Thumbnail path pointed to missing file or NEF — try RAW extraction once
        if (isRaw(displayName) && filePath && phase === 'ready' && src?.startsWith('media://')) {
            void loadRaw(filePath, { current: false });
            return;
        }
        setPhase('error');
    }, [displayName, filePath, phase, src, loadRaw]);

    if (phase === 'idle' || phase === 'loading') {
        return (
            <div className={styles.noImage} title={phase === 'loading' ? 'Loading preview…' : '…'}>
                …
            </div>
        );
    }

    if (phase === 'error' || !src) {
        return <div className={styles.noImage} title="No preview">No preview</div>;
    }

    return (
        <img
            src={src}
            loading="lazy"
            className={className}
            style={imageStyle}
            alt={alt || displayName}
            onError={onImgError}
        />
    );
};

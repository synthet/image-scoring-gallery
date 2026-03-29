import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { Logger } from '../../services/Logger';
import { useKeyboardLayer } from '../../hooks/useKeyboardLayer';
import styles from './GalleryGrid.module.css';
import { toMediaUrl } from '../../utils/mediaUrl';

interface Image {
    id: number;
    file_path: string;
    file_name: string;
    thumbnail_path?: string;
    score_general: number;
    score_technical?: number;
    score_aesthetic?: number;
    score_spaq?: number;
    score_ava?: number;
    score_koniq?: number;
    score_paq2piq?: number;
    score_liqe?: number;
    rating: number;
    label: string | null;
    created_at?: string;
    title?: string;
    description?: string;
    keywords?: string;
    stack_id?: number | null;
    stack_key?: number;
    image_count?: number;
    sort_value?: number;
}

import type { Folder } from '../Tree/treeUtils';
import { Folder as FolderIcon, Layers } from 'lucide-react';

interface GalleryGridProps {
    images: Image[];
    onSelect?: (image: Image) => void;
    onEndReached?: () => void;
    subfolders?: Folder[];
    onSelectFolder?: (folder: Folder) => void;
    onNavigateToParent?: () => void;
    viewerOpen?: boolean;
    sortBy?: string;
    stacksMode?: boolean;
    stacks?: Image[];
    onSelectStack?: (stack: Image) => void;
    onStackEndReached?: () => void;
    activeStackId?: number | null;
    highlightOutliers?: boolean;
    outlierIds?: Set<number>;
    outlierMetaById?: Map<number, { zScore: number; outlierScore: number; neighborSummary: string }>;
}

const EMPTY_OUTLIER_IDS = new Set<number>();
const EMPTY_OUTLIER_META = new Map<number, { zScore: number; outlierScore: number; neighborSummary: string }>();

const ItemContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ style, children, className, ...props }, ref) => (
    <div ref={ref} style={style} className={`${styles.listContainer} ${className || ''}`} {...props}>
        {children}
    </div>
));

const ItemWrapper = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ children, className, ...props }, ref) => (
    <div ref={ref} className={`${styles.cardWrapper} ${className || ''}`} {...props}>
        {children}
    </div>
));

export const GalleryGrid: React.FC<GalleryGridProps> = ({
    images, onSelect, onEndReached, subfolders, onSelectFolder,
    onNavigateToParent, viewerOpen = false, sortBy = 'score_general',
    stacksMode = false, stacks = [], onSelectStack, onStackEndReached,
    activeStackId, highlightOutliers = false, outlierIds = EMPTY_OUTLIER_IDS, outlierMetaById = EMPTY_OUTLIER_META
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Escape key handler for parent navigation (only when viewer is closed)
    useKeyboardLayer('page', useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && onNavigateToParent) {
            onNavigateToParent();
            return true;
        }
        return false;
    }, [onNavigateToParent]), !viewerOpen);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        Logger.info('GalleryGrid Updated', {
            imagesCount: images.length,
            firstId: images[0]?.id,
            lastId: images[images.length - 1]?.id,
            containerHeight: el.clientHeight
        });
    }, [images.length, images]);

    const gridComponents = useMemo(() => ({
        List: ItemContainer,
        Item: ItemWrapper
    }), []);

    const getScoreDisplay = useCallback((img: Image) => {
        switch (sortBy) {
            case 'created_at':
                return img.created_at ? new Date(img.created_at).toLocaleDateString() : '-';
            case 'id':
                return `#${img.id}`;
            case 'score_technical':
                return img.score_technical ? `${Math.round(img.score_technical * 100)}%` : '-';
            case 'score_aesthetic':
                return img.score_aesthetic ? `${Math.round(img.score_aesthetic * 100)}%` : '-';
            case 'score_spaq':
                return img.score_spaq ? `${Math.round(img.score_spaq * 100)}%` : '-';
            case 'score_ava':
                return img.score_ava ? `${Math.round(img.score_ava * 100)}%` : '-';
            case 'score_liqe':
                return img.score_liqe ? `${Math.round(img.score_liqe * 100)}%` : '-';
            default:
                return img.score_general > 0 ? `${Math.round(img.score_general * 100)}%` : '-';
        }
    }, [sortBy]);

    const getLabelColor = useCallback((label: string | null) => {
        return label === 'Red' ? '#e53935' :
            label === 'Yellow' ? '#fdd835' :
                label === 'Green' ? '#43a047' :
                    label === 'Blue' ? '#1e88e5' :
                        label === 'Purple' ? '#8e24aa' : 'transparent';
    }, []);

    const renderImageCard = useCallback((img: Image, onClick: () => void) => {
        const labelColor = getLabelColor(img.label);
        const isOutlier = highlightOutliers && outlierIds.has(img.id);
        const outlierMeta = outlierMetaById.get(img.id);
        const outlierTooltip = outlierMeta
            ? `Outlier • z=${outlierMeta.zScore.toFixed(2)} • ${outlierMeta.neighborSummary}`
            : 'Outlier';

        return (
            <div
                onClick={onClick}
                className={styles.cardInner}
            >
                <div className={styles.imageArea}>
                    {(img.thumbnail_path || img.file_path) ? (
                        <img src={toMediaUrl(img.thumbnail_path || img.file_path!)} loading="lazy" className={styles.image} alt={img.file_name} />
                    ) : (
                        <div className={styles.noImage}>No Image</div>
                    )}
                    <div className={styles.ratingOverlay}>
                        <span className={styles.ratingStars}>{'★'.repeat(img.rating)}</span>
                    </div>
                    {isOutlier && (
                        <div
                            className={styles.outlierBadge}
                            title={outlierTooltip}
                            aria-label={outlierTooltip}
                        >
                            Outlier
                        </div>
                    )}
                </div>

                <div className={styles.cardMeta} style={{ borderTop: `2px solid ${labelColor}` }}>
                    <div className={styles.cardFileName} title={img.file_name}>
                        {img.file_name}
                    </div>
                    <div className={styles.cardScore}>
                        <span>{getScoreDisplay(img)}</span>
                    </div>
                </div>
            </div>
        );
    }, [getScoreDisplay, getLabelColor, highlightOutliers, outlierIds, outlierMetaById]);

    const renderStackCard = useCallback((stack: Image, onClick: () => void) => {
        const labelColor = getLabelColor(stack.label);
        const count = stack.image_count || 1;

        return (
            <div onClick={onClick} className={styles.cardInnerStack}>
                {count > 1 && (
                    <>
                        <div className={styles.stackLayer1} />
                        <div className={styles.stackLayer2} />
                    </>
                )}

                <div className={styles.imageAreaStack}>
                    {(stack.thumbnail_path || stack.file_path) ? (
                        <img src={toMediaUrl(stack.thumbnail_path || stack.file_path!)} loading="lazy" className={styles.image} alt={stack.file_name} />
                    ) : (
                        <div className={styles.noImage}>No Image</div>
                    )}

                    {count > 1 && (
                        <div className={styles.stackBadge}>
                            <Layers size={12} />
                            {count}
                        </div>
                    )}

                    <div className={styles.ratingOverlay}>
                        <span className={styles.ratingStars}>{'★'.repeat(stack.rating)}</span>
                    </div>
                </div>

                <div className={styles.cardMetaStack} style={{ borderTop: `2px solid ${labelColor}` }}>
                    <div className={styles.cardFileName} title={stack.file_name}>
                        {count > 1 ? `Stack (${count} photos)` : stack.file_name}
                    </div>
                    <div className={styles.cardScore}>
                        <span>{getScoreDisplay(stack)}</span>
                    </div>
                </div>
            </div>
        );
    }, [getScoreDisplay, getLabelColor]);

    // Determine what data source to use
    const isStacksView = stacksMode && !activeStackId;
    const displayData = isStacksView ? stacks : images;
    const endReachedHandler = isStacksView ? onStackEndReached : onEndReached;

    const itemContent = useCallback((index: number) => {
        const item = displayData[index];
        if (!item) return null;

        if (isStacksView) {
            return renderStackCard(item, () => {
                if (item.image_count && item.image_count > 1 && onSelectStack) {
                    onSelectStack(item);
                } else if (onSelect) {
                    onSelect(item);
                }
            });
        } else {
            return renderImageCard(item, () => onSelect && onSelect(item));
        }
    }, [displayData, isStacksView, renderStackCard, renderImageCard, onSelectStack, onSelect]);

    const endReachedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleEndReached = useCallback(() => {
        if (endReachedTimer.current) return;
        endReachedHandler?.();
        endReachedTimer.current = setTimeout(() => {
            endReachedTimer.current = null;
        }, 200);
    }, [endReachedHandler]);




    if (displayData.length === 0 && subfolders && subfolders.length > 0 && !activeStackId) {
        return (
            <div className={styles.subfolderGrid}>
                {subfolders.map(folder => (
                    <div
                        key={folder.id}
                        onClick={() => onSelectFolder?.(folder)}
                        className={styles.subfolderCard}
                    >
                        <FolderIcon size={48} fill="#e8bf6a" color="#e8bf6a" />
                        <span className={styles.subfolderLabel}>
                            {folder.title}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            className={styles.gridContainer}
            tabIndex={0}
            ref={(el) => {
                if (containerRef) {
                    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                }
                if (el) {
                    // Only focus if not already focused or on first mount
                    if (document.activeElement !== el) {
                        el.focus();
                    }
                }
            }}
        >
            <VirtuosoGrid
                style={{ height: '100%' }}
                totalCount={displayData.length}
                overscan={200}
                endReached={handleEndReached}
                atBottomStateChange={() => { }}
                components={gridComponents}
                itemContent={itemContent}
            />
        </div>
    );
};

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { Logger } from '../../services/Logger';

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
    onFindSimilarImages?: (image: Image) => void;
}

const ItemContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ style, children, ...props }, ref) => (
    <div
        ref={ref}
        style={{
            ...style,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px'
        }}
        {...props}
    >
        {children}
    </div>
));

const ItemWrapper = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ children, ...props }, ref) => (
    <div
        ref={ref}
        style={{
            flex: '0 0 auto',
            width: '180px', // Fixed width for now, could be responsive
            height: '240px',
            backgroundColor: '#2a2a2a',
            borderRadius: '6px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            cursor: 'pointer'
        }}
        {...props}
    >
        {children}
    </div>
));

export const GalleryGrid: React.FC<GalleryGridProps> = ({
    images, onSelect, onEndReached, subfolders, onSelectFolder,
    onNavigateToParent, viewerOpen = false, sortBy = 'score_general',
    stacksMode = false, stacks = [], onSelectStack, onStackEndReached,
    activeStackId, onFindSimilarImages
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; image: Image } | null>(null);

    // Escape key handler for parent navigation (only when viewer is closed)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle Escape if viewer is NOT open
            if (e.key === 'Escape' && onNavigateToParent && !viewerOpen && !contextMenu) {
                onNavigateToParent();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onNavigateToParent, viewerOpen, contextMenu]);

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

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setContextMenu(null);
        };

        window.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

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
        const rawPath = img.thumbnail_path || img.file_path;
        let src = '';
        if (rawPath) {
            src = `media://${rawPath}`;
        }
        const labelColor = getLabelColor(img.label);

        return (
            <div
                onClick={onClick}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (onFindSimilarImages) {
                        setContextMenu({ x: e.clientX, y: e.clientY, image: img });
                    }
                }}
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
                <div style={{ flex: 1, backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
                    {src ? (
                        <img
                            src={src}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            alt={img.file_name}
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>No Image</div>
                    )}

                    {/* Overlay Rating */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', padding: '4px' }}>
                        <span style={{ color: '#ffd700', fontSize: '12px' }}>{'★'.repeat(img.rating)}</span>
                    </div>
                </div>

                <div style={{ padding: '8px', borderTop: `2px solid ${labelColor}` }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={img.file_name}>
                        {img.file_name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginTop: '4px' }}>
                        <span>{getScoreDisplay(img)}</span>
                    </div>
                </div>
            </div>
        );
    }, [getScoreDisplay, getLabelColor, onFindSimilarImages]);

    const renderStackCard = useCallback((stack: Image, onClick: () => void) => {
        const rawPath = stack.thumbnail_path || stack.file_path;
        let src = '';
        if (rawPath) {
            src = `media://${rawPath}`;
        }
        const labelColor = getLabelColor(stack.label);
        const count = stack.image_count || 1;

        return (
            <div onClick={onClick} style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {/* Stacked card effect - background layers */}
                {count > 1 && (
                    <>
                        <div style={{
                            position: 'absolute', top: -3, left: 3, right: -3, bottom: 3,
                            backgroundColor: '#3a3a3a', borderRadius: '6px', zIndex: 0,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                        }} />
                        <div style={{
                            position: 'absolute', top: -6, left: 6, right: -6, bottom: 6,
                            backgroundColor: '#4a4a4a', borderRadius: '6px', zIndex: 0,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                    </>
                )}

                <div style={{ flex: 1, backgroundColor: '#000', position: 'relative', overflow: 'hidden', zIndex: 1, borderRadius: '6px 6px 0 0' }}>
                    {src ? (
                        <img
                            src={src}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            alt={stack.file_name}
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>No Image</div>
                    )}

                    {/* Stack count badge */}
                    {count > 1 && (
                        <div style={{
                            position: 'absolute', top: 6, right: 6,
                            backgroundColor: 'rgba(0,0,0,0.75)',
                            color: '#fff', fontSize: '11px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '10px',
                            display: 'flex', alignItems: 'center', gap: 4,
                            backdropFilter: 'blur(4px)'
                        }}>
                            <Layers size={12} />
                            {count}
                        </div>
                    )}

                    {/* Overlay Rating */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', padding: '4px' }}>
                        <span style={{ color: '#ffd700', fontSize: '12px' }}>{'★'.repeat(stack.rating)}</span>
                    </div>
                </div>

                <div style={{ padding: '8px', borderTop: `2px solid ${labelColor}`, zIndex: 1, backgroundColor: '#2a2a2a', borderRadius: '0 0 6px 6px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stack.file_name}>
                        {count > 1 ? `Stack (${count} photos)` : stack.file_name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginTop: '4px' }}>
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

    const handleEndReached = useCallback(() => {
        endReachedHandler?.();
    }, [endReachedHandler]);




    if (displayData.length === 0 && subfolders && subfolders.length > 0 && !activeStackId) {
        return (
            <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {subfolders.map(folder => (
                    <div
                        key={folder.id}
                        onClick={() => onSelectFolder?.(folder)}
                        style={{
                            width: 120,
                            height: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#252526',
                            borderRadius: 8,
                            cursor: 'pointer',
                            color: '#ccc'
                        }}
                        className="hover:bg-gray-700"
                    >
                        <FolderIcon size={48} fill="#e8bf6a" color="#e8bf6a" />
                        <span style={{
                            marginTop: 8,
                            fontSize: 12,
                            textAlign: 'center',
                            wordBreak: 'break-word',
                            maxWidth: '100%',
                            padding: '0 4px'
                        }}>
                            {folder.title}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            style={{ height: '100%', minHeight: 0, outline: 'none', padding: '10px', boxSizing: 'border-box' }}
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
                overscan={400} // Increase overscan further to prevent blank areas during fast scrolling
                endReached={handleEndReached}
                atBottomStateChange={() => { }}
                components={gridComponents}
                itemContent={itemContent}
            />

            {contextMenu && onFindSimilarImages && (() => {
                const MENU_WIDTH = 220;
                const MENU_HEIGHT = 45; // Approx height for one item + padding
                const margin = 10;

                let x = contextMenu.x;
                let y = contextMenu.y;

                if (x + MENU_WIDTH + margin > window.innerWidth) {
                    x = window.innerWidth - MENU_WIDTH - margin;
                }
                if (y + MENU_HEIGHT + margin > window.innerHeight) {
                    y = window.innerHeight - MENU_HEIGHT - margin;
                }

                return (
                    <div
                        style={{
                            position: 'fixed',
                            top: y,
                            left: x,
                            zIndex: 2000,
                            minWidth: MENU_WIDTH,
                            background: '#252526',
                            border: '1px solid #3b3b3b',
                            borderRadius: 6,
                            boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
                            padding: 4,
                            animation: 'menu-scale-in 0.1s ease-out',
                            transformOrigin: 'top left'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <style>{`
                            @keyframes menu-scale-in {
                                from { opacity: 0; transform: scale(0.95); }
                                to { opacity: 1; transform: scale(1); }
                            }
                        `}</style>
                        <button
                            onClick={() => {
                                onFindSimilarImages(contextMenu.image);
                                setContextMenu(null);
                            }}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 10px',
                                border: 'none',
                                background: 'transparent',
                                color: '#e6e6e6',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: '12px',
                                transition: 'background-color 0.1s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#3a3d41'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            Find Similar Images…
                        </button>
                    </div>
                );
            })()}
        </div>
    );
};

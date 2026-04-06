import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MainLayout } from '../Layout/MainLayout';
import { FsSidebar } from './FsSidebar';
import { FsImageGrid } from './FsImageGrid';
import { LightModeConfig } from './LightModeConfig';
import { useFsPagination } from './useFsPagination';
import { fsPathToSyntheticId } from './mapFsEntryToImageRow';
import type { FsImageRow } from './mapFsEntryToImageRow';
import { ImageViewer } from '../Viewer/ImageViewer';
import { NotificationTray } from '../Layout/NotificationTray';
import { bridge } from '../../bridge';
import type { Folder } from '../Tree/treeUtils';
import breadcrumbStyles from '../../styles/breadcrumbs.module.css';
import styles from './FsGallery.module.css';
import { ArrowLeft, ChevronRight, FolderOpen, ImageIcon } from 'lucide-react';
import { invalidateFsReadDirCacheForFolder } from './fsReadDirCache';
import { invalidateRawPreviewCacheForFolder } from '../../utils/galleryRawPreviewCache';
import { useAppMode } from '../../context/AppModeContext';

function fsDirsToSubfolders(entries: { name: string; path: string }[]): Folder[] {
    return entries.map((d) => ({
        id: fsPathToSyntheticId(`${d.path}\0dir`),
        path: d.path,
        parent_id: null,
        is_fully_scored: 0,
        image_count: 0,
        title: d.name,
    }));
}

/** Breadcrumb segments from light-mode root through the selected folder. */
function pathChain(rootPath: string, targetPath: string): { label: string; full: string }[] {
    const sep = rootPath.includes('\\') ? '\\' : '/';
    const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const r = norm(rootPath);
    const t = norm(targetPath);
    if (t === r) {
        const leaf = rootPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || rootPath;
        return [{ label: leaf, full: rootPath }];
    }
    if (!t.startsWith(r + '/') && t !== r) {
        const leaf = targetPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || targetPath;
        return [{ label: leaf, full: targetPath }];
    }
    const rest = t.slice(r.length).replace(/^\//, '');
    const parts = rest.split('/').filter(Boolean);
    const rootLeaf = rootPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || rootPath;
    let acc = rootPath.replace(/[/\\]+$/, '');
    const chain: { label: string; full: string }[] = [{ label: rootLeaf, full: rootPath }];
    for (const p of parts) {
        acc = acc + sep + p;
        chain.push({ label: p, full: acc });
    }
    return chain;
}

function isElectronHost(): boolean {
    return typeof window !== 'undefined' && !!window.electron;
}

export const FsGallery: React.FC = () => {
    const { exitFolderMode } = useAppMode();
    const [rootPath, setRootPath] = useState<string>('');
    const [rootResolved, setRootResolved] = useState(false);
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [openingImage, setOpeningImage] = useState<FsImageRow | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [folderCacheReload, setFolderCacheReload] = useState({ nonce: 0, folderPath: '' });

    const { items, subDirectories, totalCount, loading, hasMore, loadMore } = useFsPagination(
        selectedPath || null,
        folderCacheReload.nonce,
    );

    const refreshRootFromConfig = useCallback(async () => {
        setRootResolved(false);
        try {
            const root = await bridge.getLightModeRoot();
            if (root) {
                setRootPath(root);
                setSelectedPath((prev) => (prev ? prev : root));
            } else {
                setRootPath('');
            }
        } catch (e) {
            console.error('[FsGallery] getLightModeRoot', e);
            setRootPath('');
        } finally {
            setRootResolved(true);
        }
    }, []);

    useEffect(() => {
        void refreshRootFromConfig();
    }, [refreshRootFromConfig]);

    useEffect(() => {
        if (rootPath && !selectedPath) {
            setSelectedPath(rootPath);
        }
    }, [rootPath, selectedPath]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isHardReload =
                (e.key === 'r' || e.key === 'R') &&
                e.shiftKey &&
                (e.ctrlKey || e.metaKey);
            if (!isHardReload) return;
            const t = e.target as HTMLElement | null;
            if (
                t &&
                (t.tagName === 'INPUT' ||
                    t.tagName === 'TEXTAREA' ||
                    t.tagName === 'SELECT' ||
                    t.isContentEditable)
            ) {
                return;
            }
            if (!selectedPath.trim()) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            invalidateFsReadDirCacheForFolder(selectedPath);
            invalidateRawPreviewCacheForFolder(selectedPath);
            setFolderCacheReload((s) => ({ nonce: s.nonce + 1, folderPath: selectedPath }));
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [selectedPath]);

    const subfolders = useMemo(() => fsDirsToSubfolders(subDirectories), [subDirectories]);

    const handleSelectFolder = (folder: Folder) => {
        setSelectedPath(folder.path);
        setOpeningImage(null);
    };

    const handleNavigateToParent = () => {
        if (!selectedPath || !rootPath) return;
        if (selectedPath === rootPath) return;
        const trimmed = selectedPath.replace(/[/\\]+$/, '');
        const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        const parent = lastSep <= 0 ? rootPath : trimmed.slice(0, lastSep);
        const rootNorm = rootPath.replace(/[/\\]+$/, '');
        const parentNorm = parent.replace(/[/\\]+$/, '');
        if (parentNorm.length < rootNorm.length || !parentNorm.toLowerCase().startsWith(rootNorm.toLowerCase())) {
            setSelectedPath(rootPath);
        } else {
            setSelectedPath(parent);
        }
        setOpeningImage(null);
    };

    const handleImageClick = (img: FsImageRow) => {
        const idx = items.findIndex((i) => i.id === img.id);
        setCurrentIndex(idx >= 0 ? idx : 0);
        setOpeningImage(img);
    };

    const handleNavigateImage = (idx: number) => {
        if (idx >= 0 && idx < items.length) {
            setCurrentIndex(idx);
            setOpeningImage(items[idx]);
        }
    };

    const breadcrumbsNode = useMemo(() => {
        if (!rootPath || !selectedPath) return null;
        const chain = pathChain(rootPath, selectedPath);
        return (
            <>
                {chain.map((part, index) => (
                    <span key={part.full} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedPath(part.full);
                                setOpeningImage(null);
                            }}
                            disabled={index === chain.length - 1}
                            aria-current={index === chain.length - 1 ? 'page' : undefined}
                            className={breadcrumbStyles.breadcrumbButton}
                        >
                            {part.label}
                        </button>
                        {index < chain.length - 1 && <ChevronRight size={14} color="#666" />}
                    </span>
                ))}
            </>
        );
    }, [rootPath, selectedPath]);

    const canNavigateBack = selectedPath && rootPath && selectedPath !== rootPath;

    const noRootMessage = !isElectronHost()
        ? 'Folder mode needs the Electron desktop app. A Vite-only session (localhost:5173) cannot access your filesystem. Run npm run dev to launch Electron, or use database mode once the API and DB are reachable.'
        : 'Could not resolve folder mode root. Use “Root folder…” in the sidebar to set lightModeRootFolder in config.';

    const showRootLoading = !rootResolved;
    const showNoRoot = rootResolved && !rootPath;

    const noRootPanel = showNoRoot ? (
        <div className={styles.noRoot}>
            <p style={{ margin: '0 0 14px', lineHeight: 1.55, maxWidth: 520 }}>{noRootMessage}</p>
            <button type="button" className={styles.folderModeButton} onClick={() => void exitFolderMode()}>
                Return to database gallery
            </button>
        </div>
    ) : null;

    const noRootSidebarHint = showNoRoot ? (
        <div className={styles.noRoot} style={{ fontSize: '0.88em' }}>
            No folder root available. See the main panel for details and “Return to database gallery”.
        </div>
    ) : null;

    return (
        <>
            <MainLayout
                breadcrumbs={breadcrumbsNode}
                header={
                    <div className={styles.headerRow}>
                        <h2 className={styles.headerTitle}>Gallery</h2>
                        <span className={styles.headerBadge}>
                            <FolderOpen size={11} />
                            Folder Mode
                        </span>
                        <span className={styles.headerCount}>
                            {totalCount} image{totalCount !== 1 ? 's' : ''}{loading ? ' · loading…' : ''}
                        </span>
                    </div>
                }
                sidebar={
                    <div className={styles.sidebarWrapper}>
                        <div style={{ marginBottom: 12 }}>
                            <button
                                type="button"
                                disabled={!canNavigateBack}
                                onClick={handleNavigateToParent}
                                className={styles.backButton}
                            >
                                <ArrowLeft size={15} />
                                Back
                            </button>
                        </div>
                        {showRootLoading ? (
                            <div className={styles.noRoot}>Loading root…</div>
                        ) : rootPath ? (
                            <FsSidebar
                                rootPath={rootPath}
                                selectedPath={selectedPath}
                                onSelectPath={(p) => {
                                    setSelectedPath(p);
                                    setOpeningImage(null);
                                }}
                                onOpenLightSettings={() => setSettingsOpen(true)}
                                folderCacheReload={folderCacheReload}
                            />
                        ) : (
                            noRootSidebarHint
                        )}
                    </div>
                }
                content={
                    showRootLoading ? (
                        <div className={styles.noRoot}>Loading root…</div>
                    ) : rootPath ? (
                        <div className={styles.contentWrapper}>
                            {totalCount === 0 && !loading && subfolders.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <ImageIcon size={48} className={styles.emptyStateIcon} />
                                    <p className={styles.emptyStateTitle}>No images in this folder</p>
                                    <p className={styles.emptyStateHint}>
                                        Navigate to a folder containing image files (JPG, NEF, CR2, DNG, etc.) 
                                        or use the sidebar tree to browse subdirectories.
                                    </p>
                                </div>
                            ) : (
                                <FsImageGrid
                                    images={items}
                                    subfolders={subfolders}
                                    onSelect={handleImageClick}
                                    onEndReached={() => void loadMore()}
                                    onSelectFolder={handleSelectFolder}
                                    onNavigateToParent={canNavigateBack ? handleNavigateToParent : undefined}
                                    viewerOpen={!!openingImage}
                                />
                            )}
                        </div>
                    ) : (
                        noRootPanel
                    )
                }
            />

            {openingImage && (
                <ImageViewer
                    image={openingImage}
                    readOnlyFilesystemMode
                    onClose={() => setOpeningImage(null)}
                    allImages={items}
                    currentIndex={currentIndex}
                    onNavigate={handleNavigateImage}
                />
            )}

            <LightModeConfig
                open={settingsOpen}
                initialPath={rootPath}
                onClose={() => setSettingsOpen(false)}
                onSaved={(newRoot) => {
                    setRootPath(newRoot);
                    setSelectedPath(newRoot);
                    setOpeningImage(null);
                }}
            />

            <NotificationTray />
        </>
    );
};

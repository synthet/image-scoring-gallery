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
import { ChevronRight } from 'lucide-react';
import { invalidateFsReadDirCacheForFolder } from './fsReadDirCache';
import { invalidateRawPreviewCacheForFolder } from '../../utils/galleryRawPreviewCache';

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

export const FsGallery: React.FC = () => {
    const [rootPath, setRootPath] = useState<string>('');
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
        try {
            const root = await bridge.getLightModeRoot();
            if (root) {
                setRootPath(root);
                setSelectedPath((prev) => (prev ? prev : root));
            }
        } catch (e) {
            console.error('[FsGallery] getLightModeRoot', e);
            setRootPath('');
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

    return (
        <>
            <MainLayout
                breadcrumbs={breadcrumbsNode}
                header={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2em' }}>Folder mode</h2>
                        <span style={{ fontSize: '0.85em', color: '#888' }}>
                            ({totalCount} images{loading ? ', loading…' : ''})
                        </span>
                    </div>
                }
                sidebar={
                    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ marginBottom: 12 }}>
                            <button
                                type="button"
                                disabled={!canNavigateBack}
                                onClick={handleNavigateToParent}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: canNavigateBack ? '#4caf50' : '#3a3a3a',
                                    color: canNavigateBack ? '#fff' : '#888',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: canNavigateBack ? 'pointer' : 'not-allowed',
                                    fontWeight: 'bold',
                                }}
                            >
                                Back
                            </button>
                        </div>
                        {rootPath ? (
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
                            <div style={{ color: '#888', fontSize: 13 }}>Loading root…</div>
                        )}
                    </div>
                }
                content={
                    rootPath ? (
                        <div
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'hidden',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <FsImageGrid
                                images={items}
                                subfolders={subfolders}
                                onSelect={handleImageClick}
                                onEndReached={() => void loadMore()}
                                onSelectFolder={handleSelectFolder}
                                onNavigateToParent={canNavigateBack ? handleNavigateToParent : undefined}
                                viewerOpen={!!openingImage}
                            />
                        </div>
                    ) : (
                        <div style={{ padding: 24, color: '#888' }}>Could not resolve folder mode root.</div>
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

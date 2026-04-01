import React, { useCallback, useEffect, useRef, useState } from 'react';
import { bridge } from '../../bridge';
import { Folder, FolderOpen, Settings2 } from 'lucide-react';
import styles from './FsGallery.module.css';
import {
    normalizeFsPathForCache,
    parentDirNormalized,
    readFsDirCached,
} from './fsReadDirCache';

interface FsDirEntry {
    name: string;
    path: string;
}

interface FsSidebarProps {
    rootPath: string;
    selectedPath: string;
    onSelectPath: (dirPath: string) => void;
    onOpenLightSettings: () => void;
    /** Bumped with folder path when user forces cache reload (Ctrl/Cmd+Shift+R). */
    folderCacheReload?: { nonce: number; folderPath: string };
}

export const FsSidebar: React.FC<FsSidebarProps> = ({
    rootPath,
    selectedPath,
    onSelectPath,
    onOpenLightSettings,
    folderCacheReload = { nonce: 0, folderPath: '' },
}) => {
    const [childrenByPath, setChildrenByPath] = useState<Record<string, FsDirEntry[]>>({});
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootPath]));
    const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
    const loadedRef = useRef<Set<string>>(new Set());

    const loadChildren = useCallback(async (dirPath: string) => {
        if (loadedRef.current.has(dirPath)) return;
        loadedRef.current.add(dirPath);
        setLoadingPaths((prev) => new Set(prev).add(dirPath));
        try {
            const res = await readFsDirCached((args) => bridge.readFsDir(args), {
                dirPath,
                kinds: 'dirsOnly',
            });
            setChildrenByPath((prev) => ({ ...prev, [dirPath]: res.directories }));
        } catch (e) {
            console.error('[FsSidebar] readFsDir', e);
            loadedRef.current.delete(dirPath);
            setChildrenByPath((prev) => ({ ...prev, [dirPath]: [] }));
        } finally {
            setLoadingPaths((prev) => {
                const next = new Set(prev);
                next.delete(dirPath);
                return next;
            });
        }
    }, []);

    useEffect(() => {
        loadedRef.current = new Set();
        setChildrenByPath({});
        setExpanded(new Set([rootPath]));
        void loadChildren(rootPath);
    }, [rootPath, loadChildren]);

    useEffect(() => {
        if (!folderCacheReload.folderPath.trim()) return;
        const baseNorm = normalizeFsPathForCache(folderCacheReload.folderPath).toLowerCase();
        setChildrenByPath((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
                const nk = normalizeFsPathForCache(k).toLowerCase();
                if (nk === baseNorm || nk.startsWith(`${baseNorm}/`)) {
                    delete next[k];
                }
            }
            return next;
        });
        for (const k of [...loadedRef.current]) {
            const nk = normalizeFsPathForCache(k).toLowerCase();
            if (nk === baseNorm || nk.startsWith(`${baseNorm}/`)) {
                loadedRef.current.delete(k);
            }
        }
        const par = parentDirNormalized(folderCacheReload.folderPath);
        if (par) {
            const pLower = par.toLowerCase();
            setChildrenByPath((prev) => {
                const next = { ...prev };
                for (const k of Object.keys(next)) {
                    if (normalizeFsPathForCache(k).toLowerCase() === pLower) {
                        delete next[k];
                    }
                }
                return next;
            });
            for (const k of [...loadedRef.current]) {
                if (normalizeFsPathForCache(k).toLowerCase() === pLower) {
                    loadedRef.current.delete(k);
                }
            }
        }
        if (!loadedRef.current.has(rootPath)) {
            void loadChildren(rootPath);
        }
    }, [folderCacheReload.nonce, folderCacheReload.folderPath, rootPath, loadChildren]);

    const toggleExpand = (dirPath: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(dirPath)) {
                next.delete(dirPath);
            } else {
                next.add(dirPath);
                void loadChildren(dirPath);
            }
            return next;
        });
    };

    const renderNode = (dirPath: string, depth: number): React.ReactNode => {
        const name =
            dirPath === rootPath
                ? rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath
                : dirPath.split(/[/\\]/).filter(Boolean).pop() || dirPath;
        const kids = childrenByPath[dirPath];
        const isExpanded = expanded.has(dirPath);
        const isLoading = loadingPaths.has(dirPath);
        const isSelected = selectedPath === dirPath;

        return (
            <div key={dirPath} className={styles.treeNode} style={{ marginLeft: depth === 0 ? 0 : 12 }}>
                <div className={styles.treeNodeInner} data-selected={isSelected}>
                    <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        onClick={() => toggleExpand(dirPath)}
                        className={styles.expandButton}
                    >
                        {isLoading ? '…' : isExpanded ? '▼' : '▶'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelectPath(dirPath)}
                        className={styles.folderButton}
                        title={name}
                    >
                        {isExpanded
                            ? <FolderOpen size={14} color="#90caf9" />
                            : <Folder size={14} color="#78909c" />
                        }
                        <span className={styles.folderName}>{name}</span>
                    </button>
                </div>
                {isExpanded && kids && kids.map((ch) => renderNode(ch.path, depth + 1))}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div className={styles.sidebarMeta}>
                <div className={styles.sidebarMetaLabel}>Folder mode root</div>
                <div className={styles.sidebarMetaPath} title={rootPath}>
                    {rootPath}
                </div>
            </div>
            <div className={styles.sidebarTree}>
                {renderNode(rootPath, 0)}
            </div>
            <button
                type="button"
                onClick={onOpenLightSettings}
                className={styles.settingsButton}
            >
                <Settings2 size={14} /> Root folder…
            </button>
        </div>
    );
};

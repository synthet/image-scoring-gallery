import React, { useCallback, useEffect, useRef, useState } from 'react';
import { bridge } from '../../bridge';
import { Folder, FolderOpen, Settings2 } from 'lucide-react';
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
            <div key={dirPath} style={{ marginLeft: depth === 0 ? 0 : 12 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 2px',
                        borderRadius: 4,
                        background: isSelected ? 'rgba(0, 122, 204, 0.25)' : 'transparent',
                    }}
                >
                    <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        onClick={() => toggleExpand(dirPath)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            padding: 2,
                            width: 22,
                            lineHeight: 1,
                        }}
                    >
                        {isLoading ? '…' : isExpanded ? '▼' : '▶'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelectPath(dirPath)}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'none',
                            border: 'none',
                            color: '#e0e0e0',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 13,
                            padding: '4px 6px',
                        }}
                    >
                        {isExpanded ? <FolderOpen size={14} color="#90caf9" /> : <Folder size={14} color="#78909c" />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    </button>
                </div>
                {isExpanded && kids && kids.map((ch) => renderNode(ch.path, depth + 1))}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{ padding: '8px 0', borderBottom: '1px solid #444', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Folder mode root</div>
                <div style={{ fontSize: 11, color: '#aaa', wordBreak: 'break-all' }} title={rootPath}>
                    {rootPath}
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                {renderNode(rootPath, 0)}
            </div>
            <button
                type="button"
                onClick={onOpenLightSettings}
                style={{
                    marginTop: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: 10,
                    background: '#333',
                    color: '#eee',
                    border: '1px solid #555',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13,
                }}
            >
                <Settings2 size={16} /> Root folder…
            </button>
        </div>
    );
};

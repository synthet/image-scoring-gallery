import { useState, useEffect, useMemo } from 'react';
import { buildFolderTree } from '../components/Tree/treeUtils';
import type { Folder } from '../components/Tree/treeUtils';

interface FolderRow {
    id: number;
    path: string;
    parent_id: number | null;
    is_fully_scored: number;
    image_count: number;
    indexing_status?: string;
    scoring_status?: string;
    tagging_status?: string;
}

export function useFolders(): { folders: Folder[]; loading: boolean; refresh: () => void } {
    const [flatFolders, setFlatFolders] = useState<FolderRow[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFolders = () => {
        if (!window.electron) return;
        setLoading(true);

        const foldersPromise = window.electron.getFolders();
        const scopeTreePromise = window.electron.api.getScopeTree().catch(() => null);

        Promise.all([foldersPromise, scopeTreePromise]).then(([folderRows, scopeTree]) => {
            if (scopeTree?.folders?.length) {
                const statusByPath = new Map(
                    scopeTree.folders.map(f => [f.folder_path, f])
                );
                const merged: FolderRow[] = folderRows.map(row => {
                    const phaseStatus = statusByPath.get(row.path);
                    if (!phaseStatus) return row;
                    return {
                        ...row,
                        indexing_status: phaseStatus.indexing_status,
                        scoring_status: phaseStatus.scoring_status,
                        tagging_status: phaseStatus.tagging_status,
                    };
                });
                setFlatFolders(merged);
            } else {
                setFlatFolders(folderRows);
            }
            setLoading(false);
        }).catch(err => {
            console.error('[useFolders] Failed to fetch folders:', err);
            setLoading(false);
        });
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchFolders();
    }, []);

    const folderTree = useMemo(() => buildFolderTree(flatFolders), [flatFolders]);

    return { folders: folderTree, loading, refresh: fetchFolders };
}

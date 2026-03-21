import { useState, useEffect, useMemo, useRef } from 'react';
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
    const initialLoadDone = useRef(false);

    const fetchFolders = () => {
        if (!window.electron) return;
        
        if (!initialLoadDone.current) {
            setLoading(true);
        }

        const foldersPromise = window.electron.getFolders();
        
        foldersPromise.then(folderRows => {
            setFlatFolders(folderRows);
            initialLoadDone.current = true;
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

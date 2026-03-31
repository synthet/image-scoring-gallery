import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bridge } from '../../bridge';
import { mapFsEntryToImageRow, type FsImageRow } from './mapFsEntryToImageRow';
import { readFsDirCached } from './fsReadDirCache';

const PAGE_SIZE = 80;

export interface FsDirEntry {
    name: string;
    path: string;
}

export function useFsPagination(selectedDir: string | null, folderReloadNonce = 0) {
    const [items, setItems] = useState<FsImageRow[]>([]);
    const [subDirectories, setSubDirectories] = useState<FsDirEntry[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);
    const requestIdRef = useRef(0);

    useEffect(() => {
        requestIdRef.current += 1;
        const rid = requestIdRef.current;
        offsetRef.current = 0;
        setItems([]);
        setSubDirectories([]);
        setTotalCount(0);
        setHasMore(true);
        setLoading(false);

        if (!selectedDir) {
            return;
        }

        setLoading(true);
        void readFsDirCached((args) => bridge.readFsDir(args), {
            dirPath: selectedDir,
            offset: 0,
            limit: PAGE_SIZE,
        })
            .then((res) => {
                if (rid !== requestIdRef.current) return;
                setTotalCount(res.totalImageCount);
                setSubDirectories(res.directories);
                const mapped = res.images.map((im) => mapFsEntryToImageRow(im.path, im.name));
                setItems(mapped);
                offsetRef.current = mapped.length;
                setHasMore(res.totalImageCount > mapped.length);
            })
            .catch((e) => {
                console.error('[useFsPagination]', e);
            })
            .finally(() => {
                if (rid === requestIdRef.current) setLoading(false);
            });

        return () => {
            requestIdRef.current += 1;
        };
    }, [selectedDir, folderReloadNonce]);

    const loadMore = useCallback(async () => {
        if (!selectedDir || loading || !hasMore) return;
        const rid = requestIdRef.current;
        setLoading(true);
        try {
            const res = await readFsDirCached((args) => bridge.readFsDir(args), {
                dirPath: selectedDir,
                offset: offsetRef.current,
                limit: PAGE_SIZE,
            });
            if (rid !== requestIdRef.current) return;
            const mapped = res.images.map((im) => mapFsEntryToImageRow(im.path, im.name));
            setItems((prev) => [...prev, ...mapped]);
            offsetRef.current += mapped.length;
            setHasMore(offsetRef.current < res.totalImageCount);
        } catch (e) {
            console.error('[useFsPagination] loadMore', e);
        } finally {
            if (rid === requestIdRef.current) setLoading(false);
        }
    }, [selectedDir, loading, hasMore]);

    return useMemo(
        () => ({ items, subDirectories, totalCount, loading, hasMore, loadMore }),
        [items, subDirectories, totalCount, loading, hasMore, loadMore],
    );
}

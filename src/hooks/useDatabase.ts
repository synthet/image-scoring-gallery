import React, { useState, useEffect, useCallback, useRef } from 'react';
import { bridge } from '../bridge';

const MAX_LOADED_ITEMS = 2000;

interface ImageQueryOptions {
    limit?: number;
    offset?: number;
    folderId?: number;
    folderIds?: number[];
    minRating?: number;
    colorLabel?: string;
    keyword?: string;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
}

interface ImageRow {
    id: number;
    file_path: string;
    file_name: string;
    score_general: number;
    score_technical: number;
    score_aesthetic: number;
    score_spaq: number;
    score_ava: number;
    score_liqe: number;
    rating: number;
    label: string | null;
    created_at?: string;
    thumbnail_path?: string;
    stack_id?: number | null;
    stack_key?: number;
    image_count?: number;
    sort_value?: number;
}

export function useDatabase() {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const MAX_AUTO_RETRIES = 3;
    const BASE_DELAY_MS = 2000;

    const connect = useCallback(async () => {
        setError(null);

        const CONNECT_TIMEOUT_MS = 20000;

        try {
            await Promise.race([
                (async () => {
                    const res = await bridge.ping();
                    if (res !== 'pong') {
                        throw new Error('Main process not responding');
                    }

                    const dbConnected = await bridge.checkDbConnection();
                    if (!dbConnected) {
                        throw new Error("Database connection returned false");
                    }
                })(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(
                        `Connection timeout after ${CONNECT_TIMEOUT_MS / 1000}s — is Firebird running?`
                    )), CONNECT_TIMEOUT_MS)
                )
            ]);

            setIsConnected(true);
            setError(null);
            setRetryCount(0);
        } catch (e: unknown) {
            setIsConnected(false);
            const msg = e instanceof Error ? e.message : 'Unknown connection error';
            console.error(`[useDatabase] Connection attempt failed:`, msg);
            setError(msg);
        }
    }, []);

    // Initial connection + auto-retry with backoff
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        connect();
    }, [connect]);

    useEffect(() => {
        if (error && retryCount < MAX_AUTO_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
            console.log(`[useDatabase] Auto-retry ${retryCount + 1}/${MAX_AUTO_RETRIES} in ${delay}ms...`);
            const timer = setTimeout(() => {
                setRetryCount(prev => prev + 1);
                connect();
            }, delay);
            return () => clearTimeout(timer);
        }
    }, [error, retryCount, connect]);

    // Manual retry (resets counter)
    const retry = useCallback(() => {
        setRetryCount(0);
        setError(null);
        connect();
    }, [connect]);

    const checkConnection = async () => {
        return await bridge.checkDbConnection();
    };

    return { isConnected, error, checkConnection, retry };
}

export function useImageCount() {
    const [count, setCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        bridge.getImageCount().then(res => {
            if (typeof res === 'number') setCount(res);
            setLoading(false);
        });
    }, []);

    return { count, loading };
}

export function useKeywords() {
    const [keywords, setKeywords] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const fetched = useRef(false);

    const fetch = useCallback(() => {
        if (fetched.current) return;
        fetched.current = true;
        setLoading(true);
        bridge.getKeywords().then(res => {
            if (Array.isArray(res)) setKeywords(res);
            setLoading(false);
        });
    }, []);

    return { keywords, loading, fetch };
}

/**
 * Generic hook for paginated data fetching with memory management.
 */
function usePaginatedData<T extends { id: number }>(
    pageSize: number,
    folderId: number | undefined,
    filters: ImageQueryOptions | undefined,
    fetchFunc: (options: ImageQueryOptions) => Promise<T[]>,
    countFunc: (options: ImageQueryOptions) => Promise<number>,
    getUniqueKey: (item: T) => string | number
) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    // Use refs to avoid stale closures
    const itemsRef = useRef<T[]>([]);
    const offsetRef = useRef(0);
    const filtersRef = useRef<ImageQueryOptions | undefined>(filters);
    const folderIdRef = useRef(folderId);
    const loadingRef = useRef(false);
    const hasMoreRef = useRef(true);
    const queryVersionRef = useRef(0);
    const requestIdRef = useRef(0);

    // Stable refs for caller-provided functions — updated each render so
    // loadMore/refresh never close over stale implementations.
    const fetchFuncRef = useRef(fetchFunc);
    fetchFuncRef.current = fetchFunc;
    const countFuncRef = useRef(countFunc);
    countFuncRef.current = countFunc;
    const getUniqueKeyRef = useRef(getUniqueKey);
    getUniqueKeyRef.current = getUniqueKey;

    const trimItems = useCallback((nextItems: T[]) => {
        if (nextItems.length <= MAX_LOADED_ITEMS) {
            return nextItems;
        }
        return nextItems.slice(nextItems.length - MAX_LOADED_ITEMS);
    }, []);

    // dedupeItems uses the ref so the callback itself is stable.
    const dedupeItems = useCallback((nextItems: T[]) => {
        const seenKeys = new Set<string | number>();
        return nextItems.filter(item => {
            const key = getUniqueKeyRef.current(item);
            if (seenKeys.has(key)) {
                return false;
            }
            seenKeys.add(key);
            return true;
        });
    }, []);

    // Update refs when deps change
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    useEffect(() => {
        offsetRef.current = offset;
    }, [offset]);

    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    useEffect(() => {
        folderIdRef.current = folderId;
    }, [folderId]);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        hasMoreRef.current = hasMore;
    }, [hasMore]);

    // Serialise filters to a primitive so the reset effect below can use a
    // stable dep without suppressing exhaustive-deps for an expression.
    const filterKey = JSON.stringify(filters);

    // Reset when folder or filters change.
    useEffect(() => {
        queryVersionRef.current += 1;
        requestIdRef.current += 1;
        offsetRef.current = 0;
        loadingRef.current = false;
        hasMoreRef.current = true;

        setItems([]);
        setOffset(0);
        setHasMore(true);
        setLoading(false);

        // eslint-disable-next-line react-hooks/exhaustive-deps
        const options: ImageQueryOptions = { folderId, ...filtersRef.current };
        countFuncRef.current(options).then((c: number) => {
            setTotalCount(c);
        }).catch(err => {
            console.error('Failed to fetch count:', err);
        });
    // filterKey is a stable string derived from filters; folderId is primitive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folderId, filterKey]);

    // Load a page and ignore stale responses from previous refresh/filter versions.
    // loadMore is stable (only depends on pageSize and trimItems) because all
    // other dependencies are read via refs at call time.
    const loadMore = useCallback(async () => {
        if (loadingRef.current || !hasMoreRef.current) return;

        const requestId = ++requestIdRef.current;
        const queryVersionAtStart = queryVersionRef.current;
        loadingRef.current = true;
        setLoading(true);
        try {
            const options: ImageQueryOptions = { limit: pageSize, offset: offsetRef.current, folderId: folderIdRef.current, ...filtersRef.current };
            const newItems = await fetchFuncRef.current(options);

            // Ignore outdated request results (e.g. old events racing a newer refresh).
            if (queryVersionAtStart !== queryVersionRef.current || requestId !== requestIdRef.current) {
                return;
            }

            if (newItems.length < pageSize) {
                hasMoreRef.current = false;
                setHasMore(false);
            }

            setItems(prev => {
                // Deduplicate by unique key
                const existingKeys = new Set(prev.map(item => getUniqueKeyRef.current(item)));
                const filtered = newItems.filter(item => !existingKeys.has(getUniqueKeyRef.current(item)));
                const merged = trimItems([...prev, ...filtered]);

                return merged;
            });

            setOffset(prev => prev + pageSize);
        } catch (err) {
            console.error("Failed to load data:", err);
        } finally {
            if (requestId === requestIdRef.current) {
                loadingRef.current = false;
                setLoading(false);
            }
        }
    }, [pageSize, trimItems]);

    // Keep a ref to loadMore so the initial-load effect can call the latest
    // version without listing loadMore as a dep (which would re-run the effect
    // every render since loadMore changes when pageSize/trimItems change).
    const loadMoreRef = useRef(loadMore);
    loadMoreRef.current = loadMore;

    // Initial load when offset becomes 0
    useEffect(() => {
        if (offset === 0 && hasMore && !loading) {
            loadMoreRef.current();
        }
    // loadMoreRef is intentionally excluded — it is a ref (stable object) whose
    // .current is always up to date. Listing loadMore directly would cause this
    // effect to re-fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offset, hasMore, loading]);

    const refresh = useCallback((options?: { preserveItems?: boolean }) => {
        const preserveItems = options?.preserveItems ?? false;

        queryVersionRef.current += 1;
        requestIdRef.current += 1;

        if (preserveItems && itemsRef.current.length > 0) {
            const requestId = requestIdRef.current;
            const queryVersionAtStart = queryVersionRef.current;

            loadingRef.current = true;
            setLoading(true);

            const countOptions: ImageQueryOptions = {
                folderId: folderIdRef.current,
                ...filtersRef.current,
            };
            const hasTrimmedItems = offsetRef.current > itemsRef.current.length;

            if (hasTrimmedItems) {
                void countFuncRef.current(countOptions).then(freshCount => {
                    if (queryVersionAtStart !== queryVersionRef.current || requestId !== requestIdRef.current) {
                        return;
                    }

                    const hasMoreItems = freshCount > offsetRef.current;
                    hasMoreRef.current = hasMoreItems;
                    setTotalCount(freshCount);
                    setHasMore(hasMoreItems);
                }).catch(err => {
                    console.error('Failed to refresh data count:', err);
                }).finally(() => {
                    if (requestId === requestIdRef.current) {
                        loadingRef.current = false;
                        setLoading(false);
                    }
                });
                return;
            }

            const nextLimit = Math.min(Math.max(itemsRef.current.length, pageSize), MAX_LOADED_ITEMS);
            const listOptions: ImageQueryOptions = {
                limit: nextLimit,
                offset: 0,
                folderId: folderIdRef.current,
                ...filtersRef.current,
            };

            void Promise.all([
                fetchFuncRef.current(listOptions),
                countFuncRef.current(countOptions),
            ]).then(([freshItems, freshCount]) => {
                if (queryVersionAtStart !== queryVersionRef.current || requestId !== requestIdRef.current) {
                    return;
                }

                const normalizedItems = trimItems(dedupeItems(freshItems));
                itemsRef.current = normalizedItems;
                offsetRef.current = normalizedItems.length;
                hasMoreRef.current = freshCount > normalizedItems.length;

                setItems(normalizedItems);
                setTotalCount(freshCount);
                setOffset(normalizedItems.length);
                setHasMore(freshCount > normalizedItems.length);
            }).catch(err => {
                console.error('Failed to refresh data:', err);
            }).finally(() => {
                if (requestId === requestIdRef.current) {
                    loadingRef.current = false;
                    setLoading(false);
                }
            });
            return;
        }

        offsetRef.current = 0;
        loadingRef.current = false;
        hasMoreRef.current = true;
        setOffset(0);
        setItems([]);
        setHasMore(true);
        setLoading(false);
        void Promise.resolve().then(() => {
            void loadMoreRef.current();
        });
    }, [dedupeItems, pageSize, trimItems]);

    const removeItem = useCallback((key: string | number) => {
        setItems(prev => prev.filter(item => getUniqueKey(item) !== key));
        setTotalCount(prev => Math.max(0, prev - 1));

    }, [getUniqueKey]);

    return React.useMemo(() => ({ items, loading, hasMore, loadMore, totalCount, refresh, removeItem }), [items, loading, hasMore, loadMore, totalCount, refresh, removeItem]);
}

export function useImages(pageSize: number = 50, folderId?: number, filters?: ImageQueryOptions) {
    const getUniqueKey = React.useCallback((img: ImageRow) => img.id, []);
    const result = usePaginatedData(
        pageSize,
        folderId,
        filters,
        (opts) => bridge.getImages(opts),
        (opts) => bridge.getImageCount(opts),
        getUniqueKey
    );

    return React.useMemo(() => ({
        images: result.items,
        loading: result.loading,
        hasMore: result.hasMore,
        loadMore: result.loadMore,
        totalCount: result.totalCount,
        refresh: result.refresh,
        removeImage: (id: number) => result.removeItem(id)
    }), [result.items, result.loading, result.hasMore, result.loadMore, result.totalCount, result.refresh, result.removeItem]);
}

export function useStacks(pageSize: number = 50, folderId?: number, filters?: ImageQueryOptions) {
    const getUniqueKey = React.useCallback((stack: ImageRow) => stack.stack_key || stack.id, []);
    const result = usePaginatedData(
        pageSize,
        folderId,
        filters,
        (opts) => bridge.getStacks(opts),
        (opts) => bridge.getStackCount(opts),
        getUniqueKey
    );

    return React.useMemo(() => ({
        stacks: result.items,
        loading: result.loading,
        hasMore: result.hasMore,
        loadMore: result.loadMore,
        totalCount: result.totalCount,
        refresh: result.refresh
    }), [result.items, result.loading, result.hasMore, result.loadMore, result.totalCount, result.refresh]);
}

export interface SimilarImageResult {
    image_id: number;
    file_path: string;
    similarity: number;
    [key: string]: unknown;
}

export interface SimilarImageSearchOptions {
    limit?: number;
    folderId?: number;
    folderPath?: string;
    minSimilarity?: number;
}

export function useSimilarImages(
    imageId: number | null,
    options: SimilarImageSearchOptions = {}
) {

    const {
        limit = 20,
        folderId,
        folderPath,
        minSimilarity = 0.8,
    } = options;

    const [images, setImages] = useState<SimilarImageResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!imageId) {
            return;
        }

        let isMounted = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        setError(null);

        const normalizedFolderPath = folderPath?.trim() || undefined;
        const normalizedMinSimilarity = Number.isFinite(minSimilarity)
            ? Math.min(1, Math.max(0, minSimilarity))
            : 0.8;

        bridge.searchSimilarImages({
            imageId,
            limit,
            folderId,
            folderPath: normalizedFolderPath,
            minSimilarity: normalizedMinSimilarity,
        })
            .then(res => {
                if (isMounted) {
                    setImages((res.results || []) as SimilarImageResult[]);
                }
            })
            .catch(err => {
                if (isMounted) {
                    setError(err.message || 'Failed to fetch similar images');
                    console.error('[useSimilarImages] Error:', err);
                }
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [imageId, limit, folderId, folderPath, minSimilarity]);

    return React.useMemo(() => ({
        images: imageId ? images : [],
        loading: imageId ? loading : false,
        error: imageId ? error : null,
    }), [images, loading, error, imageId]);
}

export function usePropagateTags() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const propagate = async (options: BackendTagPropagationRequest) => {
        setLoading(true);
        setError(null);
        try {
            const res = await bridge.api.propagateTags(options);
            return res;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Tag propagation failed';
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return React.useMemo(() => ({ propagate, loading, error }), [propagate, loading, error]);
}

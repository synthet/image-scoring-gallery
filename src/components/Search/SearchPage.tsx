import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
    Search,
    Sparkles,
    Image as ImageIcon,
    SlidersHorizontal,
    X,
    Loader2,
} from 'lucide-react';
import type { TextSearchResultItem } from '../../../electron/apiTypes';
import type { Folder } from '../Tree/treeUtils';
import { bridge } from '../../bridge';
import { toMediaUrl } from '../../utils/mediaUrl';
import { useSemanticTextSearch } from '../../hooks/useSemanticTextSearch';
import { SearchProgressOverlay } from './SearchProgressOverlay';
import styles from './SearchPage.module.css';

const RESULT_LIMITS = [12, 24, 48, 96] as const;
const MIN_SIM_OPTIONS = [
    { label: 'None', value: undefined as number | undefined },
    { label: '≥ 0.15', value: 0.15 },
    { label: '≥ 0.20', value: 0.2 },
    { label: '≥ 0.25', value: 0.25 },
    { label: '≥ 0.30', value: 0.3 },
] as const;

const EXAMPLE_QUERIES = [
    'sunset over mountains',
    'portrait with dramatic lighting',
    'birds in flight',
    'forest path in autumn',
    'ocean waves crashing',
    'city skyline at night',
    'close-up of flower petals',
    'snow-covered landscape',
];

const EXAMPLE_ROTATE_MS = 10_000;

function pickExampleSubset(pool: string[], count = 6): string[] {
    if (!pool.length) return [];
    if (pool.length <= count) {
        return [...pool].sort(() => Math.random() - 0.5);
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function SimilarityBar({ similarity }: { similarity: number }) {
    const pct = Math.min(100, similarity * 100);
    const hue = Math.round(pct * 1.2);
    return (
        <div className={styles.simBarTrack}>
            <div
                className={styles.simBarFill}
                style={{
                    width: `${pct}%`,
                    background: `hsl(${hue}, 70%, 50%)`,
                }}
            />
        </div>
    );
}

function ResultCard({
    result,
    rank,
    onClick,
}: {
    result: TextSearchResultItem;
    rank: number;
    onClick: () => void;
}) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const fileName = result.file_path.split(/[/\\]/).pop() ?? result.file_path;

    return (
        <button
            type="button"
            className={styles.card}
            onClick={onClick}
            title={`${fileName}\nSimilarity: ${(result.similarity * 100).toFixed(1)}%`}
        >
            <div className={styles.cardImage}>
                {!error ? (
                    <img
                        src={toMediaUrl(result.file_path)}
                        alt={fileName}
                        loading="lazy"
                        onLoad={() => setLoaded(true)}
                        onError={() => setError(true)}
                        style={{ opacity: loaded ? 1 : 0 }}
                    />
                ) : (
                    <div className={styles.thumbPlaceholder}>
                        <ImageIcon size={24} />
                        <span>Preview unavailable</span>
                    </div>
                )}
                {!loaded && !error && (
                    <div className={styles.thumbSpinner}>
                        <div className={styles.spinner} />
                    </div>
                )}
            </div>
            <div className={styles.cardFooter}>
                <div className={styles.cardRow}>
                    <span className={styles.rank}>#{rank}</span>
                    <span className={styles.fileName} title={fileName}>
                        {fileName}
                    </span>
                </div>
                <div className={styles.simRow}>
                    <SimilarityBar similarity={result.similarity} />
                    <span className={styles.simPct}>{(result.similarity * 100).toFixed(1)}%</span>
                </div>
            </div>
        </button>
    );
}

export interface SearchPageProps {
    currentFolder: Folder | null | undefined;
    onBack: () => void;
    onOpenImage: (imageId: number) => void;
}

export function SearchPage({ currentFolder, onBack, onOpenImage }: SearchPageProps) {
    const folderPath = currentFolder?.path;

    const [queryText, setQueryText] = useState('');
    const [limit, setLimit] = useState<(typeof RESULT_LIMITS)[number]>(24);
    const [minSim, setMinSim] = useState<number | undefined>(undefined);
    const [showFilters, setShowFilters] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const { status, isSearching, data, error, activeQuery, search, cancel } = useSemanticTextSearch();

    const [examplePool, setExamplePool] = useState<string[]>(EXAMPLE_QUERIES);
    const [rotatingChips, setRotatingChips] = useState(() => pickExampleSubset(EXAMPLE_QUERIES));
    const [placeholderIdx, setPlaceholderIdx] = useState(0);
    const examplePoolRef = useRef(examplePool);
    examplePoolRef.current = examplePool;

    useEffect(() => {
        let mounted = true;
        void bridge
            .getSearchExampleQueries({ limit: 48, folder_path: folderPath })
            .then((res) => {
                if (!mounted) return;
                const qs = res?.queries?.length ? res.queries : EXAMPLE_QUERIES;
                setExamplePool(qs);
                setRotatingChips(pickExampleSubset(qs));
                setPlaceholderIdx(0);
            })
            .catch(() => {
                if (!mounted) return;
                setExamplePool(EXAMPLE_QUERIES);
            });
        return () => {
            mounted = false;
        };
    }, [folderPath]);

    useEffect(() => {
        const rotate = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            const pool = examplePoolRef.current;
            if (!pool.length) return;
            setRotatingChips(pickExampleSubset(pool));
            setPlaceholderIdx((i) => (i + 1) % pool.length);
        };
        const id = window.setInterval(rotate, EXAMPLE_ROTATE_MS);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') rotate();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    const searchPlaceholder = useMemo(() => {
        if (examplePool.length > 0) {
            return `Describe what you're looking for… (e.g. ${examplePool[placeholderIdx % examplePool.length]})`;
        }
        return "Describe what you're looking for…";
    }, [examplePool, placeholderIdx]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const runSearch = useCallback(
        (q?: string) => {
            const text = (q ?? queryText).trim();
            if (!text || isSearching) return;
            if (q) setQueryText(q);
            setHasSearched(true);
            void search({
                query: text,
                limit,
                folder_path: folderPath,
                min_similarity: minSim,
            });
        },
        [queryText, isSearching, search, limit, folderPath, minSim],
    );

    const handleClear = useCallback(() => {
        setQueryText('');
        setHasSearched(false);
        cancel();
        inputRef.current?.focus();
    }, [cancel]);

    const results = data?.results ?? [];
    const showError = status === 'error' && error;
    const showNoResults =
        hasSearched && !isSearching && status === 'success' && results.length === 0;
    const showResults = results.length > 0;

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <div className={styles.headerInner}>
                    <div className={styles.backBar}>
                        <button type="button" className={styles.backBtn} onClick={onBack}>
                            ← Back to Gallery
                        </button>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            runSearch();
                        }}
                    >
                        <div
                            className={`${styles.searchForm} ${isSearching ? styles.searchFormFetching : ''}`}
                        >
                            {isSearching ? (
                                <Loader2 size={16} className={styles.iconAccent} />
                            ) : (
                                <Search size={16} className={styles.iconMuted} />
                            )}
                            <input
                                ref={inputRef}
                                type="text"
                                className={styles.searchInput}
                                value={queryText}
                                onChange={(e) => setQueryText(e.target.value)}
                                placeholder={searchPlaceholder}
                                id="search-query-input"
                            />
                            {queryText && (
                                <button
                                    type="button"
                                    className={styles.clearBtn}
                                    onClick={handleClear}
                                    aria-label="Clear query"
                                >
                                    <X size={14} />
                                </button>
                            )}
                            <button
                                type="button"
                                className={`${styles.filterBtn} ${showFilters ? styles.filterBtnActive : ''}`}
                                onClick={() => setShowFilters(!showFilters)}
                                title="Search filters"
                            >
                                <SlidersHorizontal size={14} />
                            </button>
                            <button
                                type="submit"
                                disabled={!queryText.trim() || isSearching}
                                className={`${styles.submitBtn} ${
                                    queryText.trim() && !isSearching
                                        ? styles.submitBtnEnabled
                                        : styles.submitBtnDisabled
                                }`}
                                id="search-submit-btn"
                            >
                                Search
                            </button>
                        </div>
                    </form>
                    {showFilters && (
                        <div className={styles.filters}>
                            <label>
                                <span className={styles.scopeLabel}>Results</span>
                                <select
                                    value={limit}
                                    onChange={(e) => {
                                        setLimit(Number(e.target.value) as (typeof RESULT_LIMITS)[number]);
                                        if (hasSearched && queryText.trim()) runSearch();
                                    }}
                                >
                                    {RESULT_LIMITS.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span className={styles.scopeLabel}>Min similarity</span>
                                <select
                                    value={minSim ?? ''}
                                    onChange={(e) => {
                                        setMinSim(e.target.value ? Number(e.target.value) : undefined);
                                        if (hasSearched && queryText.trim()) runSearch();
                                    }}
                                >
                                    {MIN_SIM_OPTIONS.map((opt) => (
                                        <option key={opt.label} value={opt.value ?? ''}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {folderPath && (
                                <div>
                                    <span className={styles.scopeLabel}>Scope: </span>
                                    <span className={styles.scopeValue} title={folderPath}>
                                        {folderPath.split(/[/\\]/).pop()}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.resultsWrap}>
                {isSearching && activeQuery && (
                    <SearchProgressOverlay query={activeQuery} onCancel={cancel} />
                )}

                {!hasSearched && (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <Sparkles size={28} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h2 className={styles.emptyTitle}>Semantic Image Search</h2>
                            <p className={styles.emptyDesc}>
                                Search your image library with natural language. Powered by CLIP
                                embeddings and vector similarity.
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <span className={styles.chipsLabel}>Try a query</span>
                            <div className={styles.chips}>
                                {rotatingChips.map((q, i) => (
                                    <button
                                        key={`${q}-${i}`}
                                        type="button"
                                        className={styles.chip}
                                        onClick={() => runSearch(q)}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {showError && (
                    <div className={styles.errorBlock}>
                        <div className={styles.errorTitle}>Search failed</div>
                        <div className={styles.errorMsg}>{error}</div>
                    </div>
                )}

                {showNoResults && (
                    <div className={styles.noResults}>
                        <ImageIcon size={36} />
                        <p className={styles.noResultsText}>No matches found</p>
                        <p className={styles.noResultsHint}>
                            Try a different query, lower the similarity threshold, or ensure images
                            have CLIP embeddings (run tagging).
                        </p>
                    </div>
                )}

                {showResults && (
                    <div className={styles.resultsSection}>
                        <div className={styles.metaBar}>
                            <div>
                                <span className={styles.metaAccent}>{results.length}</span>
                                {' result'}
                                {results.length !== 1 ? 's' : ''} for &ldquo;
                                <span className={styles.metaQuery}>{data?.query ?? activeQuery}</span>
                                &rdquo;
                            </div>
                            <div>
                                space:{' '}
                                <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    {data?.embedding_space}
                                </span>
                            </div>
                        </div>
                        <div className={styles.grid}>
                            {results.map((result, i) => (
                                <ResultCard
                                    key={result.image_id}
                                    result={result}
                                    rank={i + 1}
                                    onClick={() => onOpenImage(result.image_id)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

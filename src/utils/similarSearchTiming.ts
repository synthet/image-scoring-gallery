/** Persisted response-time samples for similar-image search (per scope). */

export type SimilarSearchScope = 'library' | 'folder';

export interface AdaptiveProgressConfig {
    /** Progress bar maximum (tick count). */
    progressMax: number;
    /** Interval between progress updates (ms). */
    tickMs: number;
    /** Estimated time to reach ~90% progress while waiting (ms). */
    estimatedMs: number;
}

export interface SimilarSearchTimingStore {
    version: 1;
    library: number[];
    folder: number[];
}

const STORAGE_KEY = 'similar-search-timing-v1';
const MAX_SAMPLES = 24;

const DEFAULT_CONFIG: Record<SimilarSearchScope, AdaptiveProgressConfig> = {
    library: { progressMax: 100, tickMs: 45, estimatedMs: 4200 },
    folder: { progressMax: 100, tickMs: 35, estimatedMs: 2600 },
};

function emptyStore(): SimilarSearchTimingStore {
    return { version: 1, library: [], folder: [] };
}

export function readSimilarSearchTimingStore(): SimilarSearchTimingStore {
    if (typeof localStorage === 'undefined') {
        return emptyStore();
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyStore();
        const parsed = JSON.parse(raw) as Partial<SimilarSearchTimingStore>;
        if (parsed.version !== 1) return emptyStore();
        return {
            version: 1,
            library: Array.isArray(parsed.library)
                ? parsed.library.filter((n) => Number.isFinite(n) && n > 0)
                : [],
            folder: Array.isArray(parsed.folder)
                ? parsed.folder.filter((n) => Number.isFinite(n) && n > 0)
                : [],
        };
    } catch {
        return emptyStore();
    }
}

export function writeSimilarSearchTimingStore(store: SimilarSearchTimingStore): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Quota or private mode — ignore.
    }
}

export function recordSimilarSearchDuration(durationMs: number, scope: SimilarSearchScope): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const rounded = Math.round(durationMs);
    const store = readSimilarSearchTimingStore();
    const bucket = scope === 'folder' ? store.folder : store.library;
    bucket.push(rounded);
    if (bucket.length > MAX_SAMPLES) {
        bucket.splice(0, bucket.length - MAX_SAMPLES);
    }
    writeSimilarSearchTimingStore(store);
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx]!;
}

/** Derive progress bar max, tick interval, and ETA from stored response times. */
export function getAdaptiveProgressConfig(scope: SimilarSearchScope): AdaptiveProgressConfig {
    const defaults = DEFAULT_CONFIG[scope];
    const samples = scope === 'folder'
        ? readSimilarSearchTimingStore().folder
        : readSimilarSearchTimingStore().library;

    if (samples.length === 0) {
        return { ...defaults };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const p75 = percentile(sorted, 0.75);
    const estimatedMs = Math.max(600, Math.min(45_000, Math.round(p75 * 1.12)));

    // More samples → finer ticks; keep between 30–180 ms per tick.
    const tickCountTarget = Math.min(80, Math.max(24, Math.round(estimatedMs / 60)));
    const tickMs = Math.max(30, Math.min(180, Math.round(estimatedMs / tickCountTarget)));

    // Scale progressMax with slower searches (more visual range for long waits).
    const progressMax = estimatedMs > 8000 ? 150 : estimatedMs > 4000 ? 120 : 100;

    return { progressMax, tickMs, estimatedMs };
}

export function getLastSimilarSearchDuration(scope: SimilarSearchScope): number | null {
    const samples = scope === 'folder'
        ? readSimilarSearchTimingStore().folder
        : readSimilarSearchTimingStore().library;
    if (samples.length === 0) return null;
    return samples[samples.length - 1] ?? null;
}

/**
 * Maximal Marginal Relevance (MMR) for backup selection — TypeScript port of backend diversity.py.
 */

export type MmrItem = {
    id: number;
    score: number;
    embedding?: Float32Array;
};

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function normalizeScores(scores: number[]): number[] {
    if (scores.length === 0) return [];
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    if (max <= min) return scores.map(() => 1);
    return scores.map((s) => (s - min) / (max - min));
}

function dotProduct(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

/**
 * Pre-normalize embeddings to unit length so cosine similarity is a plain dot product.
 *
 * Only valid when every embedding has the same length: `cosineSimilarity` truncates to
 * `min(a.length, b.length)` and takes norms over that prefix, so with ragged dimensions
 * the norm is pair-dependent and cannot be precomputed. Ragged input falls back to the
 * original pairwise function, keeping results identical either way.
 */
function buildUnitEmbeddings(
    embeddings: readonly (Float32Array | undefined)[],
): { units: (Float32Array | null)[]; uniform: boolean } {
    let dim = -1;
    let uniform = true;
    for (const e of embeddings) {
        if (!e) continue;
        if (dim === -1) dim = e.length;
        else if (e.length !== dim) { uniform = false; break; }
    }

    const units: (Float32Array | null)[] = new Array(embeddings.length).fill(null);
    if (!uniform) return { units, uniform };

    for (let i = 0; i < embeddings.length; i++) {
        const e = embeddings[i];
        if (!e) continue;
        let norm = 0;
        for (let j = 0; j < e.length; j++) norm += e[j] * e[j];
        // Zero vector → cosineSimilarity returns 0; leaving it null reproduces that.
        if (norm === 0) continue;
        const inv = 1 / Math.sqrt(norm);
        const u = new Float32Array(e.length);
        for (let j = 0; j < e.length; j++) u[j] = e[j] * inv;
        units[i] = u;
    }
    return { units, uniform };
}

/** Similarity accessor over index pairs, using the unit fast path when available. */
function makeSimilarity(
    embeddings: readonly (Float32Array | undefined)[],
): (i: number, j: number) => number {
    const { units, uniform } = buildUnitEmbeddings(embeddings);
    if (uniform) {
        return (i, j) => {
            const a = units[i];
            const b = units[j];
            return a && b ? dotProduct(a, b) : 0;
        };
    }
    return (i, j) => {
        const a = embeddings[i];
        const b = embeddings[j];
        return a && b ? cosineSimilarity(a, b) : 0;
    };
}

/**
 * Select k items balancing score and embedding diversity.
 * Returns selected items in MMR pick order (highest marginal relevance first).
 */
export function selectWithMmr(items: MmrItem[], k: number, lambdaVal: number): MmrItem[] {
    const n = items.length;
    if (k <= 0 || n === 0) return [];
    if (k >= n || lambdaVal >= 1 || n <= 2) {
        return [...items].sort((a, b) => b.score - a.score).slice(0, k);
    }

    const normScores = normalizeScores(items.map((x) => x.score));
    const embeddings = items.map((x) => x.embedding);
    const similarity = makeSimilarity(embeddings);

    // Running max similarity of each candidate to the selected set. `max` is associative,
    // so folding in each new pick is identical to rescanning all selected every round —
    // but O(n*d) per pick instead of O(n*k*d).
    const maxSim = new Float64Array(n);
    const selected: number[] = [0];
    const remaining: number[] = [];
    for (let i = 1; i < n; i++) remaining.push(i);

    const absorbPick = (pick: number): void => {
        for (const idx of remaining) {
            if (!embeddings[idx]) continue;
            const s = similarity(idx, pick);
            if (s > maxSim[idx]) maxSim[idx] = s;
        }
    };
    absorbPick(0);

    while (selected.length < k && remaining.length > 0) {
        let bestMmr = -Infinity;
        let bestPos = 0;

        for (let p = 0; p < remaining.length; p++) {
            const idx = remaining[p];
            const mmr = lambdaVal * normScores[idx] - (1 - lambdaVal) * maxSim[idx];
            if (mmr > bestMmr) {
                bestMmr = mmr;
                bestPos = p;
            }
        }

        const pick = remaining[bestPos];
        selected.push(pick);
        remaining.splice(bestPos, 1);
        absorbPick(pick);
    }

    return selected.map((i) => items[i]);
}

const yieldToEventLoop = (): Promise<void> =>
    new Promise((resolve) => {
        if (typeof setImmediate === 'function') setImmediate(resolve);
        else setTimeout(resolve, 0);
    });

export type MmrBudgetOptions = {
    /** Reports picks made so far and the candidate pool size. */
    onProgress?: (picked: number, candidates: number) => void;
    /** Yield to the event loop after this many picks (default 50). */
    yieldEvery?: number;
};

/**
 * Greedy MMR under a byte budget (items must include estimated bytes).
 *
 * Async because exact MMR is inherently O(k*n*d) — at production scale (13k candidates,
 * 1280-dim embeddings) that is minutes of CPU, which would otherwise block Electron's
 * main process and mark the window "Not responding". Yields periodically instead.
 */
export async function selectWithMmrBudget<T extends MmrItem & { bytes: number }>(
    items: T[],
    budgetBytes: number,
    lambdaVal: number,
    options: MmrBudgetOptions = {},
): Promise<T[]> {
    if (budgetBytes <= 0 || items.length === 0) return [];

    const sorted = [...items].sort((a, b) => b.score - a.score);
    const normScores = normalizeScores(sorted.map((x) => x.score));
    const embeddings = sorted.map((x) => x.embedding);
    const similarity = makeSimilarity(embeddings);
    const selected: T[] = [];
    let used = 0;

    // First pick: highest score that fits.
    let firstIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].bytes <= budgetBytes) {
            firstIdx = i;
            break;
        }
    }
    if (firstIdx === -1) return [];
    selected.push(sorted[firstIdx]);
    used += sorted[firstIdx].bytes;

    // Indices into `sorted`, preserving score order so tie-breaking is unchanged.
    const remaining: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
        if (i !== firstIdx) remaining.push(i);
    }

    // See selectWithMmr: running max against the selected set, folded in per pick.
    const maxSim = new Float64Array(sorted.length);
    const absorbPick = (pick: number): void => {
        for (const idx of remaining) {
            if (!embeddings[idx]) continue;
            const s = similarity(idx, pick);
            if (s > maxSim[idx]) maxSim[idx] = s;
        }
    };
    absorbPick(firstIdx);

    const yieldEvery = Math.max(1, options.yieldEvery ?? 50);
    let sinceYield = 0;

    while (remaining.length > 0) {
        let bestMmr = -Infinity;
        let bestPos = -1;

        for (let p = 0; p < remaining.length; p++) {
            const idx = remaining[p];
            if (used + sorted[idx].bytes > budgetBytes) continue;

            const mmr = lambdaVal * normScores[idx] - (1 - lambdaVal) * maxSim[idx];
            if (mmr > bestMmr) {
                bestMmr = mmr;
                bestPos = p;
            }
        }

        if (bestPos === -1) break;
        const pick = remaining[bestPos];
        selected.push(sorted[pick]);
        used += sorted[pick].bytes;
        remaining.splice(bestPos, 1);
        absorbPick(pick);

        if (++sinceYield >= yieldEvery) {
            sinceYield = 0;
            options.onProgress?.(selected.length, items.length);
            await yieldToEventLoop();
        }
    }

    return selected;
}

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
    const selected: number[] = [];
    const remaining = items.map((_, i) => i);

    selected.push(0);
    remaining.splice(remaining.indexOf(0), 1);

    while (selected.length < k && remaining.length > 0) {
        let bestMmr = -Infinity;
        let bestIdx = remaining[0];

        for (const idx of remaining) {
            let maxSim = 0;
            const embIdx = items[idx].embedding;
            if (embIdx) {
                for (const sel of selected) {
                    const embSel = items[sel].embedding;
                    if (embSel) {
                        maxSim = Math.max(maxSim, cosineSimilarity(embIdx, embSel));
                    }
                }
            }
            const mmr = lambdaVal * normScores[idx] - (1 - lambdaVal) * maxSim;
            if (mmr > bestMmr) {
                bestMmr = mmr;
                bestIdx = idx;
            }
        }

        selected.push(bestIdx);
        remaining.splice(remaining.indexOf(bestIdx), 1);
    }

    return selected.map((i) => items[i]);
}

/** Greedy MMR under a byte budget (items must include estimated bytes). */
export function selectWithMmrBudget<T extends MmrItem & { bytes: number }>(
    items: T[],
    budgetBytes: number,
    lambdaVal: number,
): T[] {
    if (budgetBytes <= 0 || items.length === 0) return [];

    const sorted = [...items].sort((a, b) => b.score - a.score);
    const normScores = normalizeScores(sorted.map((x) => x.score));
    const selected: T[] = [];
    let used = 0;

    // First pick: highest score that fits.
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].bytes <= budgetBytes) {
            selected.push(sorted[i]);
            used += sorted[i].bytes;
            break;
        }
    }
    if (selected.length === 0) return [];

    const remaining = sorted.filter((x) => !selected.includes(x));

    while (remaining.length > 0) {
        let bestMmr = -Infinity;
        let bestItem: T | null = null;
        let bestIndex = -1;

        for (let i = 0; i < remaining.length; i++) {
            const item = remaining[i];
            if (used + item.bytes > budgetBytes) continue;

            let maxSim = 0;
            if (item.embedding) {
                for (const sel of selected) {
                    if (sel.embedding) {
                        maxSim = Math.max(maxSim, cosineSimilarity(item.embedding, sel.embedding));
                    }
                }
            }

            const scoreIdx = sorted.indexOf(item);
            const mmr = lambdaVal * normScores[scoreIdx] - (1 - lambdaVal) * maxSim;
            if (mmr > bestMmr) {
                bestMmr = mmr;
                bestItem = item;
                bestIndex = i;
            }
        }

        if (!bestItem) break;
        selected.push(bestItem);
        used += bestItem.bytes;
        remaining.splice(bestIndex, 1);
    }

    return selected;
}

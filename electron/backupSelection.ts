/**
 * Backup candidate grouping, stack pre-filter, batched similarity pair merge, and cluster selection.
 */

import type { ScoredImageForBackup } from './types';
import { selectWithMmr, type MmrItem } from './backupDiversity';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PATH_DATE = /(\d{4}-\d{2}-\d{2})/;

export type SimilarPair = { id_a: number; id_b: number; similarity: number };

export type PairQueryResult = {
    pairs: SimilarPair[];
    error?: string;
};

/** Prefer DB capture_date; fallback to first ISO date in path. */
export function backupDateKey(img: ScoredImageForBackup): string {
    const cd = img.capture_date?.trim();
    if (cd && ISO_DATE.test(cd)) return cd;
    const fromPath = img.path.match(PATH_DATE)?.[1];
    return fromPath ?? 'unknown';
}

/** Year segment for destination layout (from date key). */
export function backupYearFromDateKey(dateKey: string): string {
    if (dateKey === 'unknown') return 'unknown';
    return dateKey.split('-')[0] ?? 'unknown';
}

export function imageScore(img: ScoredImageForBackup): number {
    return img.composite_score ?? 0;
}

/**
 * Within a date group, auto-select top scorers per stack before embedding dedup.
 * Returns IDs to dedupe further vs already rejected stack duplicates.
 */
export function applyStackPrefilter(
    group: ScoredImageForBackup[],
    maxKeepPerStack: number,
): { dedupeCandidates: ScoredImageForBackup[]; stackRejectedIds: number[] } {
    if (maxKeepPerStack < 1 || group.length === 0) {
        return { dedupeCandidates: group, stackRejectedIds: [] };
    }

    // Unstacked images (stack_id null/undefined) are distinct photos the culling phase
    // did NOT find near-duplicates for — keep each as its own singleton. Do NOT bucket
    // them together, or only the top maxKeep per date survive (mass over-rejection).
    const byStack = new Map<number, ScoredImageForBackup[]>();
    const dedupeCandidates: ScoredImageForBackup[] = [];
    const stackRejectedIds: number[] = [];

    for (const img of group) {
        if (img.stack_id == null) {
            dedupeCandidates.push(img);
            continue;
        }
        if (!byStack.has(img.stack_id)) byStack.set(img.stack_id, []);
        byStack.get(img.stack_id)!.push(img);
    }

    for (const [, members] of byStack) {
        if (members.length <= maxKeepPerStack) {
            dedupeCandidates.push(...members);
            continue;
        }
        const sorted = [...members].sort((a, b) => imageScore(b) - imageScore(a));
        dedupeCandidates.push(...sorted.slice(0, maxKeepPerStack));
        for (let i = maxKeepPerStack; i < sorted.length; i++) {
            stackRejectedIds.push(sorted[i].id);
        }
    }

    return { dedupeCandidates, stackRejectedIds };
}

export function buildAdjacencyFromPairs(pairs: SimilarPair[]): Map<number, number[]> {
    const adj = new Map<number, number[]>();
    for (const pair of pairs) {
        if (!adj.has(pair.id_a)) adj.set(pair.id_a, []);
        if (!adj.has(pair.id_b)) adj.set(pair.id_b, []);
        adj.get(pair.id_a)!.push(pair.id_b);
        adj.get(pair.id_b)!.push(pair.id_a);
    }
    return adj;
}

export function mergeAdjacencyGraphs(graphs: Map<number, number[]>[]): Map<number, number[]> {
    const merged = new Map<number, number[]>();
    for (const adj of graphs) {
        for (const [id, neighbors] of adj) {
            if (!merged.has(id)) merged.set(id, []);
            const set = new Set(merged.get(id)!);
            for (const n of neighbors) set.add(n);
            merged.set(id, [...set]);
        }
    }
    return merged;
}

/** BFS connected components for images present in group. */
export function findClusters(
    group: ScoredImageForBackup[],
    adj: Map<number, number[]>,
): ScoredImageForBackup[][] {
    const byId = new Map(group.map((img) => [img.id, img]));
    const visited = new Set<number>();
    const clusters: ScoredImageForBackup[][] = [];

    for (const img of group) {
        if (visited.has(img.id)) continue;
        const clusterIds: number[] = [];
        const queue = [img.id];
        visited.add(img.id);

        while (queue.length > 0) {
            const curr = queue.shift()!;
            clusterIds.push(curr);
            for (const next of adj.get(curr) ?? []) {
                if (!visited.has(next) && byId.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            }
        }

        clusters.push(clusterIds.map((id) => byId.get(id)!).filter(Boolean));
    }

    return clusters;
}

export function computeFolderSimilarityThreshold(
    groupLength: number,
    stackedCount: number,
    roughFillRatio: number,
): number {
    const burstRatio = groupLength > 0 ? stackedCount / groupLength : 0;
    const baseSimilarity = 0.85 + 0.13 * Math.min(1, Math.max(0, roughFillRatio));
    return Math.max(0.8, Math.min(0.99, baseSimilarity - burstRatio * 0.05));
}

/** Split IDs into batches and merge pair results; collects first query error. */
export async function fetchSimilarPairsBatched(
    imageIds: number[],
    threshold: number,
    batchSize: number,
    queryFn: (ids: number[], threshold: number) => Promise<PairQueryResult>,
): Promise<PairQueryResult> {
    if (imageIds.length < 2) return { pairs: [] };

    const allPairs: SimilarPair[] = [];
    let error: string | undefined;

    for (let i = 0; i < imageIds.length; i += batchSize) {
        const batch = imageIds.slice(i, i + batchSize);
        if (batch.length < 2) continue;
        const result = await queryFn(batch, threshold);
        allPairs.push(...result.pairs);
        if (result.error && !error) error = result.error;
    }

    // Cross-batch edges: compare batch i vs batch j (i < j) when both are large enough.
    const batches: number[][] = [];
    for (let i = 0; i < imageIds.length; i += batchSize) {
        const batch = imageIds.slice(i, i + batchSize);
        if (batch.length >= 2) batches.push(batch);
    }

    for (let i = 0; i < batches.length; i++) {
        for (let j = i + 1; j < batches.length; j++) {
            const combined = [...batches[i], ...batches[j]];
            if (combined.length < 2) continue;
            const result = await queryFn(combined, threshold);
            allPairs.push(...result.pairs);
            if (result.error && !error) error = result.error;
        }
    }

    return { pairs: dedupePairs(allPairs), error };
}

function dedupePairs(pairs: SimilarPair[]): SimilarPair[] {
    const seen = new Set<string>();
    const out: SimilarPair[] = [];
    for (const p of pairs) {
        const a = Math.min(p.id_a, p.id_b);
        const b = Math.max(p.id_a, p.id_b);
        const key = `${a}:${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id_a: a, id_b: b, similarity: p.similarity });
    }
    return out;
}

export type ClusterPickOptions = {
    maxKeep: number;
    diversityLambda: number;
    embeddings: Map<number, Float32Array>;
};

/** Pick cluster survivors: score-only when maxKeep=1, else MMR. */
export function pickClusterSurvivors(
    cluster: ScoredImageForBackup[],
    options: ClusterPickOptions,
): { kept: ScoredImageForBackup[]; rejected: ScoredImageForBackup[] } {
    if (cluster.length === 0) return { kept: [], rejected: [] };

    const sorted = [...cluster].sort((a, b) => imageScore(b) - imageScore(a));
    const k = Math.min(options.maxKeep, sorted.length);

    if (k <= 1) {
        return { kept: [sorted[0]], rejected: sorted.slice(1) };
    }

    const mmrItems: MmrItem[] = sorted.map((img) => ({
        id: img.id,
        score: imageScore(img),
        embedding: options.embeddings.get(img.id),
    }));

    const pickedIds = new Set(selectWithMmr(mmrItems, k, options.diversityLambda).map((x) => x.id));
    const kept = sorted.filter((img) => pickedIds.has(img.id));
    const rejected = sorted.filter((img) => !pickedIds.has(img.id));
    return { kept, rejected };
}

/** Week bucket key for cross-day dedup: ISO year-week + camera + lens. */
export function crossDayBucketKey(
    img: ScoredImageForBackup,
    camera: string,
    lens: string,
): string {
    const dateKey = backupDateKey(img);
    let week = 'unknown';
    if (ISO_DATE.test(dateKey)) {
        const d = new Date(`${dateKey}T12:00:00Z`);
        const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
        week = `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    }
    return `${camera}|${lens}|${week}`;
}

export type DedupProgress = (current: number, total: number, detail: string) => void;

export type DedupDeps = {
    fetchPairs: (ids: number[], threshold: number) => Promise<PairQueryResult>;
    fetchEmbeddings: (ids: number[]) => Promise<Map<number, Float32Array>>;
};

export type DedupResult = {
    selectedIds: Set<number>;
    rejectedCount: number;
    warnings: string[];
};

/**
 * Per-date-group stack pre-filter, batched similarity dedup, and MMR multi-keep per cluster.
 */
export async function deduplicateByDateGroups(
    groups: Map<string, ScoredImageForBackup[]>,
    roughFillRatio: number,
    maxPerCluster: number,
    diversityLambda: number,
    pairBatchSize: number,
    deps: DedupDeps,
    onProgress?: DedupProgress,
): Promise<DedupResult> {
    const selectedIds = new Set<number>();
    const warnings: string[] = [];
    let rejectedCount = 0;
    let groupIdx = 0;
    const totalGroups = groups.size;

    for (const [date, group] of groups.entries()) {
        groupIdx++;
        onProgress?.(groupIdx, totalGroups, `Grouping ${date} (${group.length} images)...`);

        const stackedCount = group.filter((img) => img.stack_id != null).length;
        const folderThreshold = computeFolderSimilarityThreshold(group.length, stackedCount, roughFillRatio);

        const { dedupeCandidates, stackRejectedIds } = applyStackPrefilter(group, 2);
        rejectedCount += stackRejectedIds.length;

        const imageIds = dedupeCandidates.map((img) => img.id);
        const pairResult = await fetchSimilarPairsBatched(
            imageIds,
            folderThreshold,
            pairBatchSize,
            deps.fetchPairs,
        );
        if (pairResult.error) {
            warnings.push(`Similarity query failed for ${date}: ${pairResult.error}`);
        }

        const adj = buildAdjacencyFromPairs(pairResult.pairs);
        const clusters = findClusters(dedupeCandidates, adj);

        const clusterIds = clusters.flatMap((c) => c.map((x) => x.id));
        const embeddings = await deps.fetchEmbeddings(clusterIds);

        for (const cluster of clusters) {
            const { kept, rejected } = pickClusterSurvivors(cluster, {
                maxKeep: maxPerCluster,
                diversityLambda,
                embeddings,
            });
            for (const img of kept) selectedIds.add(img.id);
            rejectedCount += rejected.length;
        }
    }

    return { selectedIds, rejectedCount, warnings };
}

/** Optional cross-day dedup within camera+lens+week buckets. */
export async function applyCrossDayDedup(
    survivors: ScoredImageForBackup[],
    layoutById: Map<number, { camera: string; lens: string }>,
    maxPerCluster: number,
    diversityLambda: number,
    pairBatchSize: number,
    deps: DedupDeps,
): Promise<DedupResult> {
    const selectedIds = new Set<number>();
    const warnings: string[] = [];
    let rejectedCount = 0;

    const buckets = new Map<string, ScoredImageForBackup[]>();
    for (const img of survivors) {
        const layout = layoutById.get(img.id);
        if (!layout) {
            selectedIds.add(img.id);
            continue;
        }
        const key = crossDayBucketKey(img, layout.camera, layout.lens);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(img);
    }

    for (const [, bucket] of buckets) {
        if (bucket.length < 2) {
            for (const img of bucket) selectedIds.add(img.id);
            continue;
        }

        const imageIds = bucket.map((img) => img.id);
        const pairResult = await fetchSimilarPairsBatched(
            imageIds,
            0.92,
            pairBatchSize,
            deps.fetchPairs,
        );
        if (pairResult.error) {
            warnings.push(`Cross-day similarity query failed: ${pairResult.error}`);
            for (const img of bucket) selectedIds.add(img.id);
            continue;
        }

        const adj = buildAdjacencyFromPairs(pairResult.pairs);
        const clusters = findClusters(bucket, adj);
        const embeddings = await deps.fetchEmbeddings(clusters.flatMap((c) => c.map((x) => x.id)));

        for (const cluster of clusters) {
            const { kept, rejected } = pickClusterSurvivors(cluster, {
                maxKeep: maxPerCluster,
                diversityLambda,
                embeddings,
            });
            for (const img of kept) selectedIds.add(img.id);
            rejectedCount += rejected.length;
        }
    }

    return { selectedIds, rejectedCount, warnings };
}

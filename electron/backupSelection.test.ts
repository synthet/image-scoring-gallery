import { describe, expect, it } from 'vitest';
import type { ScoredImageForBackup } from './types';
import {
    applyStackPrefilter,
    backupDateKey,
    backupYearFromDateKey,
    buildAdjacencyFromPairs,
    computeFolderSimilarityThreshold,
    crossDayBucketKey,
    deduplicateByDateGroups,
    fetchSimilarPairsBatched,
    findClusters,
    isoWeekKey,
    pickClusterSurvivors,
    type SimilarPair,
} from './backupSelection';

function img(
    id: number,
    score: number,
    opts?: Partial<ScoredImageForBackup>,
): ScoredImageForBackup {
    return {
        id,
        path: `/photos/2024-03-15/${id}.nef`,
        file_name: `${id}.nef`,
        composite_score: score,
        image_hash: null,
        stack_id: null,
        capture_date: '2024-03-15',
        ...opts,
    };
}

describe('backupDateKey', () => {
    it('prefers capture_date', () => {
        expect(backupDateKey(img(1, 0.9, { capture_date: '2025-01-02', path: '/x/2020-01-01/a.nef' }))).toBe(
            '2025-01-02',
        );
    });

    it('falls back to path regex', () => {
        expect(backupDateKey(img(1, 0.9, { capture_date: null, path: '/lib/2023-06-10/foo.nef' }))).toBe(
            '2023-06-10',
        );
    });

    it('returns unknown when no date', () => {
        expect(backupDateKey(img(1, 0.9, { capture_date: null, path: '/no-date/foo.nef' }))).toBe('unknown');
    });
});

describe('backupYearFromDateKey', () => {
    it('extracts year', () => {
        expect(backupYearFromDateKey('2024-03-15')).toBe('2024');
    });
});

describe('applyStackPrefilter', () => {
    it('keeps top 2 per stack and rejects rest', () => {
        const group = [
            img(1, 0.9, { stack_id: 10 }),
            img(2, 0.8, { stack_id: 10 }),
            img(3, 0.7, { stack_id: 10 }),
            img(4, 0.6, { stack_id: null }),
        ];
        const { dedupeCandidates, stackRejectedIds } = applyStackPrefilter(group, 2);
        expect(dedupeCandidates.map((x) => x.id).sort()).toEqual([1, 2, 4]);
        expect(stackRejectedIds).toEqual([3]);
    });

    it('keeps every unstacked image — never buckets stack_id null together', () => {
        // Regression: previously all null-stack images on a date were trimmed to 2.
        const group = Array.from({ length: 10 }, (_, i) => img(i + 1, 0.9 - i * 0.01, { stack_id: null }));
        const { dedupeCandidates, stackRejectedIds } = applyStackPrefilter(group, 2);
        expect(dedupeCandidates.map((x) => x.id).sort((a, b) => a - b)).toEqual(
            group.map((x) => x.id),
        );
        expect(stackRejectedIds).toEqual([]);
    });

    it('trims real stacks but keeps all unstacked alongside', () => {
        const group = [
            img(1, 0.95, { stack_id: null }),
            img(2, 0.90, { stack_id: null }),
            img(3, 0.85, { stack_id: null }),
            img(4, 0.80, { stack_id: 7 }),
            img(5, 0.70, { stack_id: 7 }),
            img(6, 0.60, { stack_id: 7 }),
        ];
        const { dedupeCandidates, stackRejectedIds } = applyStackPrefilter(group, 2);
        expect(dedupeCandidates.map((x) => x.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        expect(stackRejectedIds).toEqual([6]);
    });
});

describe('findClusters', () => {
    it('forms connected components from pairs', () => {
        const group = [img(1, 0.9), img(2, 0.8), img(3, 0.7)];
        const adj = buildAdjacencyFromPairs([
            { id_a: 1, id_b: 2, similarity: 0.95 },
        ]);
        const clusters = findClusters(group, adj);
        expect(clusters).toHaveLength(2);
        const sizes = clusters.map((c) => c.length).sort();
        expect(sizes).toEqual([1, 2]);
    });
});

describe('fetchSimilarPairsBatched', () => {
    it('merges batch results', async () => {
        const result = await fetchSimilarPairsBatched(
            [1, 2, 3, 4],
            0.9,
            2,
            async (ids) => {
                if (ids.length === 2 && ids[0] === 1 && ids[1] === 2) {
                    return { pairs: [{ id_a: 1, id_b: 2, similarity: 0.95 }] };
                }
                if (ids.length === 4) {
                    return { pairs: [{ id_a: 3, id_b: 4, similarity: 0.96 }] };
                }
                return { pairs: [] };
            },
        );
        expect(result.pairs.length).toBeGreaterThanOrEqual(1);
    });

    it('surfaces query errors', async () => {
        const result = await fetchSimilarPairsBatched(
            [1, 2, 3],
            0.9,
            2,
            async () => ({ pairs: [], error: 'db down' }),
        );
        expect(result.error).toBe('db down');
    });
});

describe('pickClusterSurvivors', () => {
    it('keeps one when maxKeep is 1', () => {
        const cluster = [img(1, 0.9), img(2, 0.8)];
        const { kept, rejected } = pickClusterSurvivors(cluster, {
            maxKeep: 1,
            diversityLambda: 0.7,
            embeddings: new Map(),
        });
        expect(kept).toHaveLength(1);
        expect(kept[0].id).toBe(1);
        expect(rejected).toHaveLength(1);
    });

    it('keeps multiple diverse picks when maxKeep > 1', () => {
        const cluster = [img(1, 0.9), img(2, 0.85), img(3, 0.8)];
        const emb = (values: number[]) => new Float32Array(values);
        const embeddings = new Map<number, Float32Array>([
            [1, emb([1, 0, 0])],
            [2, emb([0.99, 0.01, 0])],
            [3, emb([0, 1, 0])],
        ]);
        const { kept } = pickClusterSurvivors(cluster, {
            maxKeep: 2,
            diversityLambda: 0.5,
            embeddings,
        });
        expect(kept.length).toBe(2);
        const keptIds = kept.map((x) => x.id).sort();
        expect(keptIds).toContain(1);
        expect(keptIds).toContain(3);
    });

    it('always keeps a low-scoring curated pick', () => {
        const cluster = [
            img(1, 0.9),
            img(2, 0.3, { is_pick: true }),
            img(3, 0.8),
        ];
        const { kept, rejected } = pickClusterSurvivors(cluster, {
            maxKeep: 1,
            diversityLambda: 0.7,
            embeddings: new Map(),
        });
        expect(kept.map((x) => x.id)).toContain(2);
        expect(rejected.map((x) => x.id)).not.toContain(2);
    });
});

describe('isoWeekKey / crossDayBucketKey', () => {
    it('uses ISO Thursday rule for year boundaries', () => {
        expect(isoWeekKey('2021-01-03')).toBe('2020-W53');
        expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
        expect(crossDayBucketKey(img(1, 0.5, { capture_date: '2021-01-03' }), 'cam', 'lens'))
            .toBe('cam|lens|2020-W53');
    });
});

describe('applyStackPrefilter picks', () => {
    it('does not trim a curated pick from a large stack', () => {
        const group = [
            img(1, 0.95, { stack_id: 10 }),
            img(2, 0.9, { stack_id: 10 }),
            img(3, 0.2, { stack_id: 10, is_pick: true }),
        ];
        const { dedupeCandidates, stackRejectedIds } = applyStackPrefilter(group, 2);
        expect(dedupeCandidates.map((x) => x.id)).toContain(3);
        expect(stackRejectedIds).not.toContain(3);
    });
});

describe('computeFolderSimilarityThreshold', () => {
    it('lowers threshold when burst ratio is high', () => {
        const lowBurst = computeFolderSimilarityThreshold(100, 10, 0.5);
        const highBurst = computeFolderSimilarityThreshold(100, 80, 0.5);
        expect(highBurst).toBeLessThan(lowBurst);
    });
});

// ── cluster ranks (fleet shard input) ─────────────────────────

describe('deduplicateByDateGroups cluster ranks', () => {
    const noPairs = async () => ({ pairs: [] as SimilarPair[] });
    const noEmbeddings = async () => new Map<number, Float32Array>();

    function scored(id: number, score: number, extra: Partial<ScoredImageForBackup> = {}) {
        return {
            id,
            path: `/p/2024-05-01/${id}.jpg`,
            file_name: `${id}.jpg`,
            composite_score: score,
            image_hash: null,
            stack_id: null,
            capture_date: '2024-05-01',
            ...extra,
        } as ScoredImageForBackup;
    }

    it('ranks every survivor and keys the group on the lowest member id', async () => {
        const group = [scored(7, 0.9), scored(3, 0.8)];
        const result = await deduplicateByDateGroups(
            new Map([['2024-05-01', group]]),
            1,
            2,
            0.7,
            500,
            { fetchPairs: noPairs, fetchEmbeddings: noEmbeddings },
        );

        // No pairs returned, so each image is its own single-member cluster.
        expect(result.clusterRanks.get(7)).toEqual({ groupKey: 'cluster:7', rank: 0 });
        expect(result.clusterRanks.get(3)).toEqual({ groupKey: 'cluster:3', rank: 0 });
    });

    it('gives rank 0 to the highest scorer of a cluster', async () => {
        const group = [scored(1, 0.5), scored(2, 0.9), scored(3, 0.7)];
        const pairs: SimilarPair[] = [
            { id_a: 1, id_b: 2, similarity: 0.95 },
            { id_a: 2, id_b: 3, similarity: 0.95 },
        ];
        const result = await deduplicateByDateGroups(
            new Map([['2024-05-01', group]]),
            1,
            3,
            1,
            500,
            { fetchPairs: async () => ({ pairs }), fetchEmbeddings: noEmbeddings },
        );

        expect(result.clusterRanks.get(2)?.rank).toBe(0);
        expect(result.clusterRanks.get(3)?.rank).toBe(1);
        expect(result.clusterRanks.get(1)?.rank).toBe(2);
        // All three share one cluster identity, keyed on the lowest member id.
        expect(result.clusterRanks.get(2)?.groupKey).toBe('cluster:1');
    });

    it('gives rank 0 to a curated pick even when it scores lowest', async () => {
        const group = [scored(1, 0.95), scored(2, 0.1, { is_pick: true })];
        const pairs: SimilarPair[] = [{ id_a: 1, id_b: 2, similarity: 0.99 }];
        const result = await deduplicateByDateGroups(
            new Map([['2024-05-01', group]]),
            1,
            2,
            1,
            500,
            { fetchPairs: async () => ({ pairs }), fetchEmbeddings: noEmbeddings },
        );

        expect(result.clusterRanks.get(2)?.rank).toBe(0);
        expect(result.clusterRanks.get(1)?.rank).toBe(1);
    });

    it('resolves equal scores by id so ranks are stable across runs', async () => {
        // Shard assignment is derived from rank; array-order ties would reshuffle every
        // drive's slice between runs and force a full re-copy.
        const pairs: SimilarPair[] = [
            { id_a: 4, id_b: 9, similarity: 0.99 },
            { id_a: 9, id_b: 6, similarity: 0.99 },
        ];
        const run = (order: number[]) => deduplicateByDateGroups(
            new Map([['2024-05-01', order.map((id) => scored(id, 0.8))]]),
            1,
            3,
            1,
            500,
            { fetchPairs: async () => ({ pairs }), fetchEmbeddings: noEmbeddings },
        );

        const a = await run([9, 4, 6]);
        const b = await run([4, 6, 9]);
        for (const id of [4, 6, 9]) {
            expect(a.clusterRanks.get(id)).toEqual(b.clusterRanks.get(id));
        }
        expect(a.clusterRanks.get(4)?.rank).toBe(0);
        expect(a.clusterRanks.get(9)?.rank).toBe(2);
    });

    it('keeps more than two frames of a real stack when maxPerCluster allows', async () => {
        // A fleet-scaled maxPerCluster must reach the stack pre-filter, or a burst can never
        // yield more survivors than a single drive would keep.
        const burst = [1, 2, 3, 4, 5].map((id) => scored(id, 1 - id * 0.01, { stack_id: 42 }));
        const result = await deduplicateByDateGroups(
            new Map([['2024-05-01', burst]]),
            1,
            4,
            1,
            500,
            { fetchPairs: noPairs, fetchEmbeddings: noEmbeddings },
        );

        expect(result.selectedIds.size).toBe(4);
        expect(result.rejectReasons.stack).toBe(1);
    });
});

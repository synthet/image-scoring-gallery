import { describe, expect, it } from 'vitest';
import type { ScoredImageForBackup } from './types';
import {
    applyStackPrefilter,
    backupDateKey,
    backupYearFromDateKey,
    buildAdjacencyFromPairs,
    computeFolderSimilarityThreshold,
    fetchSimilarPairsBatched,
    findClusters,
    pickClusterSurvivors,
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
});

describe('computeFolderSimilarityThreshold', () => {
    it('lowers threshold when burst ratio is high', () => {
        const lowBurst = computeFolderSimilarityThreshold(100, 10, 0.5);
        const highBurst = computeFolderSimilarityThreshold(100, 80, 0.5);
        expect(highBurst).toBeLessThan(lowBurst);
    });
});

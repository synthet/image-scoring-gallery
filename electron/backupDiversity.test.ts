import { describe, expect, it } from 'vitest';
import { selectWithMmr, selectWithMmrBudget, type MmrItem } from './backupDiversity';

describe('selectWithMmr', () => {
    it('returns top-k by score when lambda is 1', () => {
        const items: MmrItem[] = [
            { id: 1, score: 0.9 },
            { id: 2, score: 0.8 },
            { id: 3, score: 0.7 },
        ];
        const picked = selectWithMmr(items, 2, 1);
        expect(picked.map((x) => x.id)).toEqual([1, 2]);
    });

    it('prefers diverse embeddings over near-duplicate high scores', () => {
        const items: MmrItem[] = [
            { id: 1, score: 0.9, embedding: new Float32Array([1, 0, 0]) },
            { id: 2, score: 0.88, embedding: new Float32Array([0.99, 0.01, 0]) },
            { id: 3, score: 0.8, embedding: new Float32Array([0, 1, 0]) },
        ];
        const picked = selectWithMmr(items, 2, 0.5);
        const ids = picked.map((x) => x.id).sort();
        expect(ids).toContain(1);
        expect(ids).toContain(3);
    });
});

describe('selectWithMmrBudget', () => {
    it('respects byte budget', () => {
        type Item = MmrItem & { bytes: number };
        const items: Item[] = [
            { id: 1, score: 0.9, bytes: 100 },
            { id: 2, score: 0.85, bytes: 100 },
            { id: 3, score: 0.8, bytes: 100 },
        ];
        const picked = selectWithMmrBudget(items, 150, 0.7);
        expect(picked.length).toBe(1);
        expect(picked[0].id).toBe(1);
    });
});

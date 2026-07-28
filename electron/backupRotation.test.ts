import { describe, expect, it } from 'vitest';
import { planRotation } from './backupRotation';
import type { BackupPlannedItem } from './backupSpace';
import type { ScoredImageForBackup } from './types';

function img(id: number, score: number): ScoredImageForBackup {
    return {
        id,
        path: `/x/${id}.jpg`,
        file_name: `${id}.jpg`,
        composite_score: score,
        image_hash: null,
        stack_id: null,
        capture_date: null,
    };
}

function planned(id: number, score: number, size: number): BackupPlannedItem {
    return {
        img: img(id, score),
        sourcePath: `/x/${id}.jpg`,
        relPath: `d/${id}.jpg`,
        destPath: `/t/d/${id}.jpg`,
        fileName: `${id}.jpg`,
        score,
        sourceSize: size,
        sourceXmpSize: 0,
        skipCopy: false,
        skipCopyXmp: true,
        leafFolder: 'd',
    };
}

describe('planRotation', () => {
    it('evicts low-score residents to admit high-score drops', () => {
        const dropped = [planned(10, 0.9, 100)];
        const resident = [
            { entry: { id: 1, relPath: 'old/1.jpg', score: 0.5, size: 100, hash: '' }, size: 100 },
            { entry: { id: 0, relPath: 'pre/0.jpg', score: 0, size: 100, hash: '' }, size: 100 },
        ];
        const result = planRotation(dropped, resident, { scoreMargin: 0.05 });
        expect(result.evict.map((e) => e.entry.id)).toEqual([1]);
        expect(result.admit.map((a) => a.img.id)).toEqual([10]);
        expect(result.freedBytes).toBe(100);
    });

    it('never evicts prebuild id===0', () => {
        const dropped = [planned(10, 0.95, 100)];
        const resident = [
            { entry: { id: 0, relPath: 'pre/0.jpg', score: 0, size: 100, hash: '' }, size: 100 },
        ];
        const result = planRotation(dropped, resident, { scoreMargin: 0.05 });
        expect(result.evict).toEqual([]);
        expect(result.admit).toEqual([]);
    });

    it('requires score margin', () => {
        const dropped = [planned(10, 0.52, 100)];
        const resident = [
            { entry: { id: 1, relPath: 'old/1.jpg', score: 0.5, size: 100, hash: '' }, size: 100 },
        ];
        const result = planRotation(dropped, resident, { scoreMargin: 0.05 });
        expect(result.evict).toEqual([]);
        expect(result.admit).toEqual([]);
    });
});

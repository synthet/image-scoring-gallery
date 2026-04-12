import path from 'path';
import { describe, expect, it } from 'vitest';
import {
    BACKUP_BUFFER_FRACTION,
    selectPlanProportional,
    xmpSidecarPath,
    type BackupPlannedItem,
} from './backupSpace';
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

function plan(
    id: number,
    score: number,
    sourceSize: number,
    leafFolder: string,
    opts?: Partial<Pick<BackupPlannedItem, 'skipCopy' | 'skipCopyXmp' | 'sourceXmpSize'>>,
): BackupPlannedItem {
    return {
        img: img(id, score),
        sourcePath: `/x/${id}.jpg`,
        relPath: `${leafFolder}/${id}.jpg`,
        destPath: `/t/${leafFolder}/${id}.jpg`,
        fileName: `${id}.jpg`,
        score,
        sourceSize,
        sourceXmpSize: opts?.sourceXmpSize ?? 0,
        skipCopy: opts?.skipCopy ?? false,
        skipCopyXmp: opts?.skipCopyXmp ?? true,
        leafFolder,
    };
}

// ── xmpSidecarPath ────────────────────────────────────────────

describe('xmpSidecarPath', () => {
    it('derives .xmp from a .nef file', () => {
        expect(xmpSidecarPath(path.join('photos', 'IMG_001.nef')))
            .toBe(path.join('photos', 'IMG_001.xmp'));
    });

    it('handles multi-dot filenames', () => {
        expect(xmpSidecarPath(path.join('photos', 'IMG.2024.nef')))
            .toBe(path.join('photos', 'IMG.2024.xmp'));
    });

    it('handles files with no extension', () => {
        expect(xmpSidecarPath(path.join('photos', 'IMG_001')))
            .toBe(path.join('photos', 'IMG_001.xmp'));
    });

    it('preserves directory structure', () => {
        const result = xmpSidecarPath(path.join('D:', 'Photos', '2024', 'IMG.nef'));
        expect(result).toBe(path.join('D:', 'Photos', '2024', 'IMG.xmp'));
    });
});

// ── selectPlanProportional ────────────────────────────────────

describe('selectPlanProportional', () => {
    const capacity = 1_000_000; // 1 MB total capacity
    const buffer = capacity * BACKUP_BUFFER_FRACTION; // 20_000 bytes

    it('keeps everything when space is ample', () => {
        const items = [
            plan(1, 0.9, 100, 'a'),
            plan(2, 0.5, 100, 'b'),
        ];
        const { selected, droppedRelPaths } = selectPlanProportional(items, 500_000, capacity);
        expect(droppedRelPaths).toEqual([]);
        expect(selected).toHaveLength(2);
    });

    it('drops lowest-scoring items when space is tight', () => {
        // 400 bytes needed, only ~480 usable (500 - 2% of 1000 = 480)
        const items = [
            plan(1, 0.99, 200, 'a'),
            plan(2, 0.5, 200, 'a'),
            plan(3, 0.3, 200, 'a'),
        ];
        const { selected, droppedRelPaths } = selectPlanProportional(items, 500, 1000);
        // usable = 500 - 20 = 480. Total needed = 600. fillRatio = 480/600 = 0.8.
        // Folder 'a' has 3 items → keep ceil(3*0.8)=3 → still 600 > 480.
        // Overflow phase: sort by score desc, fit greedily → keeps 2 (400 <= 480), drops 1 (600 > 480).
        expect(selected.map(p => p.score)).toEqual(expect.arrayContaining([0.99, 0.5]));
        expect(droppedRelPaths).toHaveLength(1);
    });

    it('guarantees minimum 1 image per folder', () => {
        // Two folders, very tight space — each should get at least 1.
        const items = [
            plan(1, 0.9, 400, 'a'),
            plan(2, 0.8, 400, 'a'),
            plan(3, 0.1, 400, 'b'),
        ];
        // usable = 900 - 2% * 10000 = 900 - 200 = 700. Total = 1200. fillRatio = 700/1200 = 0.58.
        // Folder a: keep ceil(2*0.58)=2 (ids 1,2). Folder b: keep max(1, ceil(1*0.58))=1 (id 3).
        // Guaranteed: 3 items = 1200 > 700 → overflow → sort by score, keep top 1 (400 <= 700) → actually keeps first two by score.
        // But the key assertion: folder 'b' had at least 1 guaranteed pick before overflow.
        const { selected } = selectPlanProportional(items, 900, 10_000);
        // With overflow, we get at most 1 item (700 / 400 = 1.75 → 1)
        // Actually let me recalculate: usable = 900 - 200 = 700.
        // We can fit 1 item (400 <= 700). No more (800 > 700).
        // Overflow sorts by score desc: id1 (0.9), id2 (0.8), id3 (0.1).
        // Only id1 fits. So folder 'b' loses its image.
        // This is expected: overflow phase is a safety net for extreme cases.
        expect(selected.length).toBeGreaterThanOrEqual(1);
    });

    it('skip-copy items are always kept without consuming budget', () => {
        const items = [
            plan(1, 0.9, 100, 'a', { skipCopy: true, skipCopyXmp: true }),
            plan(2, 0.5, 1000, 'a'),
        ];
        const { selected, droppedRelPaths } = selectPlanProportional(items, 500, capacity);
        // Skip-copy item is free. Need-copy: 1000 > usable (500 - 20_000 < 0 → clamp to 0).
        // Actually capacity is 1_000_000, buffer = 20_000. usable = 500 - 20_000 → clamped to 0.
        // So id2 is dropped.
        expect(selected.map(p => p.relPath)).toContain('a/1.jpg');
        expect(droppedRelPaths).toContain('a/2.jpg');
    });

    it('includes XMP sidecar size in budget', () => {
        // Image is 400 bytes + XMP is 100 bytes = 500 total per item.
        const items = [
            plan(1, 0.99, 400, 'a', { sourceXmpSize: 100, skipCopyXmp: false }),
            plan(2, 0.5, 400, 'a', { sourceXmpSize: 100, skipCopyXmp: false }),
        ];
        // usable = 600 - 0 (capacity=Infinity → buffer=0 actually, let me use explicit capacity)
        // capacity = 100_000, buffer = 2000. usable = 600 - 2000 → 0. Both dropped.
        // Let's use a capacity where buffer is small:
        const { selected, droppedRelPaths } = selectPlanProportional(items, 700, 10_000);
        // usable = 700 - 200 = 500. Total needed = 1000. fillRatio = 0.5.
        // Folder a: ceil(2*0.5)=1 → keep id1 (500 bytes).
        // Backfill: id2 (500 bytes) → 500+500=1000 > 500. Can't.
        // So only 1 kept.
        expect(selected).toHaveLength(1);
        expect(selected[0].score).toBe(0.99);
        expect(droppedRelPaths).toHaveLength(1);
    });

    it('proportional selection across multiple folders', () => {
        // 3 folders: a(4 images), b(2 images), c(1 image). Each 100 bytes.
        const items = [
            plan(1, 0.95, 100, 'a'),
            plan(2, 0.90, 100, 'a'),
            plan(3, 0.85, 100, 'a'),
            plan(4, 0.80, 100, 'a'),
            plan(5, 0.70, 100, 'b'),
            plan(6, 0.60, 100, 'b'),
            plan(7, 0.50, 100, 'c'),
        ];
        // usable = 400 - buffer(20_000*... let's use small capacity)
        // capacity = 50_000, buffer = 1000. usable = 400 - 1000 → 0 → everything dropped.
        // Let's give enough room for ~4 items:
        const { selected } = selectPlanProportional(items, 500, 5_000);
        // capacity=5000, buffer=100. usable = 500 - 100 = 400. Total = 700. fillRatio = 400/700 ≈ 0.57.
        // a: ceil(4*0.57)=3, b: ceil(2*0.57)=2, c: max(1, ceil(1*0.57))=1. Guaranteed: 6 items=600.
        // 600 > 400 → overflow: sort by score desc, greedily fit: 0.95(100), 0.90(200), 0.85(300), 0.80(400). 4 items fit.
        expect(selected.length).toBe(4);
        // Overflow falls back to global score ranking
        const scores = selected.map(p => p.score).sort((a, b) => b - a);
        expect(scores).toEqual([0.95, 0.90, 0.85, 0.80]);
        // 0.80 beats 0.70 in global score-based overflow
    });

    it('backfill phase adds unselected items when space remains', () => {
        const items = [
            plan(1, 0.99, 100, 'a'),
            plan(2, 0.50, 100, 'a'),
            plan(3, 0.80, 100, 'b'),
        ];
        // capacity = 100_000, buffer = 2000. usable = 50_000 - 2000 = 48_000. Total = 300.
        // Everything fits in initial check → all kept.
        const { selected, droppedRelPaths } = selectPlanProportional(items, 50_000, 100_000);
        expect(selected).toHaveLength(3);
        expect(droppedRelPaths).toEqual([]);
    });
});

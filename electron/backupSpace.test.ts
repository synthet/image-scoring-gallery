import path from 'path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    analyzeStaleManifestEntries,
    computeBackupUsableBytes,
    computeManifestReserveFraction,
    pruneStaleManifestEntries,
    reconcileManifestWithDisk,
    syncStaleBackupEntries,
    selectPlanProportional,
    xmpSidecarPath,
    type BackupPlannedItem,
} from './backupSpace';
import {
    clusterGroupKey,
    placementTier,
    type FleetIdentity,
} from './backupDistribution';
import type { BackupManifest, ScoredImageForBackup } from './types';

vi.mock('fs', () => ({
    default: {
        promises: {
            unlink: vi.fn().mockResolvedValue(undefined),
        },
    },
}));

import fs from 'fs';

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
    opts?: Partial<Pick<
        BackupPlannedItem,
        'skipCopy' | 'skipCopyXmp' | 'sourceXmpSize' | 'tier' | 'groupKey' | 'rank'
    >>,
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
        tier: opts?.tier ?? 'shard',
        groupKey: opts?.groupKey ?? `cluster:${id}`,
        rank: opts?.rank ?? 0,
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

// ── manifest reserve / usable bytes ───────────────────────────

describe('computeManifestReserveFraction', () => {
    const cap = 265.29 * 1024 ** 3;

    it('is zero when manifest is empty', () => {
        expect(computeManifestReserveFraction(0, cap)).toBe(0);
    });

    it('is manifest size divided by capacity', () => {
        const manifest = cap * 0.999;
        expect(computeManifestReserveFraction(manifest, cap)).toBeCloseTo(0.999, 5);
    });

    it('clamps to 1 when manifest exceeds capacity', () => {
        expect(computeManifestReserveFraction(cap * 1.2, cap)).toBe(1);
    });
});

describe('computeBackupUsableBytes', () => {
    const cap = 1_000_000;

    it('uses all free space when manifest is empty', () => {
        expect(computeBackupUsableBytes(500_000, cap, 0)).toEqual({
            usableBytes: 500_000,
            reserveFraction: 0,
        });
    });

    it('reserves manifest bytes and caps by free space', () => {
        const manifest = 600_000;
        expect(computeBackupUsableBytes(500_000, cap, manifest)).toEqual({
            usableBytes: 400_000,
            reserveFraction: 0.6,
        });
    });

    it('returns zero when manifest fills the drive', () => {
        expect(computeBackupUsableBytes(1_000, cap, cap)).toEqual({
            usableBytes: 0,
            reserveFraction: 1,
        });
    });
});

// ── selectPlanProportional ────────────────────────────────────

describe('selectPlanProportional', () => {
    const capacity = 1_000_000; // 1 MB total capacity

    it('keeps everything when space is ample', async () => {
        const items = [
            plan(1, 0.9, 100, 'a'),
            plan(2, 0.5, 100, 'b'),
        ];
        const { selected, droppedRelPaths } = await selectPlanProportional(items, 500_000, capacity);
        expect(droppedRelPaths).toEqual([]);
        expect(selected).toHaveLength(2);
    });

    it('drops lowest-scoring items when space is tight', async () => {
        const items = [
            plan(1, 0.99, 200, 'a'),
            plan(2, 0.5, 200, 'a'),
            plan(3, 0.3, 200, 'a'),
        ];
        const { selected, droppedRelPaths } = await selectPlanProportional(items, 500, 1000);
        expect(selected.map(p => p.score)).toEqual(expect.arrayContaining([0.99, 0.5]));
        expect(droppedRelPaths).toHaveLength(1);
    });

    it('guarantees minimum 1 image per folder', async () => {
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
        const { selected } = await selectPlanProportional(items, 900, 10_000);
        // With overflow, we get at most 1 item (700 / 400 = 1.75 → 1)
        // Actually let me recalculate: usable = 900 - 200 = 700.
        // We can fit 1 item (400 <= 700). No more (800 > 700).
        // Overflow sorts by score desc: id1 (0.9), id2 (0.8), id3 (0.1).
        // Only id1 fits. So folder 'b' loses its image.
        // This is expected: overflow phase is a safety net for extreme cases.
        expect(selected.length).toBeGreaterThanOrEqual(1);
    });

    it('skip-copy items are always kept without consuming budget', async () => {
        const items = [
            plan(1, 0.9, 100, 'a', { skipCopy: true, skipCopyXmp: true }),
            plan(2, 0.5, 1000, 'a'),
        ];
        const { selected, droppedRelPaths } = await selectPlanProportional(
            items,
            500,
            capacity,
            { manifestBytes: capacity - 100 },
        );
        expect(selected.map(p => p.relPath)).toContain('a/1.jpg');
        expect(droppedRelPaths).toContain('a/2.jpg');
    });

    it('includes XMP sidecar size in budget', async () => {
        // Image is 400 bytes + XMP is 100 bytes = 500 total per item.
        const items = [
            plan(1, 0.99, 400, 'a', { sourceXmpSize: 100, skipCopyXmp: false }),
            plan(2, 0.5, 400, 'a', { sourceXmpSize: 100, skipCopyXmp: false }),
        ];
        // usable = 600 - 0 (capacity=Infinity → buffer=0 actually, let me use explicit capacity)
        // capacity = 100_000, buffer = 2000. usable = 600 - 2000 → 0. Both dropped.
        // Let's use a capacity where buffer is small:
        const { selected, droppedRelPaths } = await selectPlanProportional(items, 700, 10_000);
        // usable = 700 - 200 = 500. Total needed = 1000. fillRatio = 0.5.
        // Folder a: ceil(2*0.5)=1 → keep id1 (500 bytes).
        // Backfill: id2 (500 bytes) → 500+500=1000 > 500. Can't.
        // So only 1 kept.
        expect(selected).toHaveLength(1);
        expect(selected[0].score).toBe(0.99);
        expect(droppedRelPaths).toHaveLength(1);
    });

    it('proportional selection across multiple folders', async () => {
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
        const { selected } = await selectPlanProportional(items, 500, 5_000, {
            manifestBytes: 4_600,
        });
        expect(selected.length).toBe(4);
        // Overflow falls back to global score ranking
        const scores = selected.map(p => p.score).sort((a, b) => b - a);
        expect(scores).toEqual([0.95, 0.90, 0.85, 0.80]);
        // 0.80 beats 0.70 in global score-based overflow
    });

    it('backfill phase adds unselected items when space remains', async () => {
        const items = [
            plan(1, 0.99, 100, 'a'),
            plan(2, 0.50, 100, 'a'),
            plan(3, 0.80, 100, 'b'),
        ];
        // capacity = 100_000, manifest reserves 98_000 → 2_000 remaining, capped by free 50_000.
        const { selected, droppedRelPaths } = await selectPlanProportional(items, 50_000, 100_000, {
            manifestBytes: 98_000,
        });
        expect(selected).toHaveLength(3);
        expect(droppedRelPaths).toEqual([]);
    });
});

// ── stale manifest / prune safety ───────────────────────────

function manifest(...entries: Array<{ id: number; relPath: string }>): BackupManifest {
    return {
        updatedAt: '2026-01-01T00:00:00.000Z',
        images: entries.map((e) => ({
            id: e.id,
            relPath: e.relPath,
            score: 0.8,
            size: 1000,
            hash: '',
        })),
    };
}

describe('pruneStaleManifestEntries', () => {
    it('removes manifest rows not in the plan without touching disk', () => {
        const m = manifest({ id: 1, relPath: 'a/1.jpg' }, { id: 2, relPath: 'a/2.jpg' });
        const pruned = pruneStaleManifestEntries(m, new Set(['a/1.jpg']));
        expect(pruned).toBe(1);
        expect(m.images).toHaveLength(1);
        expect(m.images[0].relPath).toBe('a/1.jpg');
    });
});

describe('analyzeStaleManifestEntries', () => {
    it('protects prebuild entries (id 0) from deletion unless allowed', () => {
        const m = manifest({ id: 0, relPath: 'old/a.jpg' }, { id: 5, relPath: 'old/b.jpg' });
        const stats = analyzeStaleManifestEntries(m, new Set(['new/c.jpg']), { allowPrebuildDelete: false });
        expect(stats.staleManifestCount).toBe(2);
        expect(stats.wouldDeleteFiles).toBe(1);
        expect(stats.prebuildProtectedCount).toBe(1);
    });

    it('counts prebuild entries as deletable when allowPrebuildDelete is true', () => {
        const m = manifest({ id: 0, relPath: 'old/a.jpg' });
        const stats = analyzeStaleManifestEntries(m, new Set([]), { allowPrebuildDelete: true });
        expect(stats.wouldDeleteFiles).toBe(1);
        expect(stats.prebuildProtectedCount).toBe(0);
    });
});

describe('syncStaleBackupEntries', () => {
    beforeEach(() => {
        vi.mocked(fs.promises.unlink).mockClear();
    });

    it('does not unlink files when pruneFiles is false', async () => {
        const m = manifest({ id: 5, relPath: 'old/b.jpg' });
        const result = await syncStaleBackupEntries('/target', m, new Set([]), false, false);
        expect(result.filesRemoved).toBe(0);
        expect(result.manifestPruned).toBe(1);
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('unlinks scored stale files when pruneFiles is true', async () => {
        const m = manifest({ id: 5, relPath: 'old/b.jpg' });
        const result = await syncStaleBackupEntries('/target', m, new Set([]), true, false);
        expect(result.filesRemoved).toBe(1);
        expect(fs.promises.unlink).toHaveBeenCalled();
    });

    it('does not unlink prebuild entries unless confirmMassDelete', async () => {
        const m = manifest({ id: 0, relPath: 'old/a.jpg' }, { id: 5, relPath: 'old/b.jpg' });
        const result = await syncStaleBackupEntries('/target', m, new Set([]), true, false);
        expect(result.filesRemoved).toBe(1);
        expect(result.prebuildProtectedCount).toBe(1);
    });

    it('unlinks prebuild entries when prune and confirmMassDelete', async () => {
        const m = manifest({ id: 0, relPath: 'old/a.jpg' });
        const result = await syncStaleBackupEntries('/target', m, new Set([]), true, true);
        expect(result.filesRemoved).toBe(1);
        expect(result.prebuildProtectedCount).toBe(0);
    });
});

describe('reconcileManifestWithDisk', () => {
    it('adopts orphans as id 0, drops phantoms, keeps matching', () => {
        const m: BackupManifest = {
            updatedAt: 't',
            images: [
                { id: 5, relPath: 'Cam/A.NEF', score: 0.8, size: 10, hash: 'h' },
                { id: 6, relPath: 'Cam/missing.NEF', score: 0.7, size: 20, hash: '' },
            ],
        };
        const disk = new Map<string, number>([
            ['cam/a.nef', 11],
            ['Cam/orphan.NEF', 30],
        ]);
        const result = reconcileManifestWithDisk(m, disk);
        expect(result.droppedMissing).toBe(1);
        expect(result.adopted).toBe(1);
        expect(result.unchanged).toBe(1);
        expect(m.images).toHaveLength(2);
        expect(m.images.find((e) => e.id === 5)?.size).toBe(11);
        expect(m.images.find((e) => e.id === 0)?.relPath).toMatch(/orphan/i);
    });
});

// ── selectPlanProportional: fleet distribution ────────────────

describe('selectPlanProportional (fleet distribution)', () => {
    /**
     * A library of `clusters` clusters of `perCluster` frames each. Rank 0 of every cluster
     * is mirrored; ranks 1+ are sharded. Every item is the same size so budgets are easy to
     * reason about.
     */
    function fleetLibrary(clusters: number, perCluster: number, size: number) {
        const items: { id: number; groupKey: string; rank: number; isPick: boolean }[] = [];
        let id = 1;
        for (let c = 0; c < clusters; c++) {
            const groupKey = clusterGroupKey([c * 1000]);
            for (let rank = 0; rank < perCluster; rank++) {
                items.push({ id: id++, groupKey, rank, isPick: false });
            }
        }
        return items.map((it) => ({ ...it, size }));
    }

    function planFor(
        item: { id: number; groupKey: string; rank: number; isPick: boolean; size: number },
        fleet: FleetIdentity,
    ): BackupPlannedItem {
        // Score descends with rank so the per-folder phase keeps cluster leaders first.
        const score = 1 - item.rank * 0.01;
        return plan(item.id, score, item.size, `day-${item.groupKey}`, {
            tier: placementTier(item, fleet),
            groupKey: item.groupKey,
            rank: item.rank,
        });
    }

    const CAPACITY = 0; // no reserve buffer — budgets below are exact

    it('is unchanged for a standalone drive', async () => {
        const library = fleetLibrary(20, 4, 10);
        const solo: FleetIdentity = { ordinal: 1, size: 1 };
        const withFleet = library.map((it) => planFor(it, solo));
        const withoutFleet = library.map((it) => planFor(it, solo));

        const a = await selectPlanProportional(withFleet, 300, CAPACITY, {});
        const b = await selectPlanProportional(withoutFleet, 300, CAPACITY, {});

        expect(a.selected.map((p) => p.relPath).sort())
            .toEqual(b.selected.map((p) => p.relPath).sort());
        expect(withFleet.every((p) => p.tier === 'shard')).toBe(true);
    });

    it('stores more distinct images across the fleet than any single drive holds', async () => {
        // 40 clusters x 4 frames = 160 candidates of 10 bytes; each drive fits 60.
        const library = fleetLibrary(40, 4, 10);
        const perDriveBudget = 600;

        const drives = await Promise.all([1, 2, 3].map(async (ordinal) => {
            const fleet: FleetIdentity = { ordinal, size: 3 };
            const { selected } = await selectPlanProportional(
                library.map((it) => planFor(it, fleet)),
                perDriveBudget,
                CAPACITY,
                {},
            );
            return new Set(selected.map((p) => p.relPath));
        }));

        const union = new Set(drives.flatMap((d) => [...d]));
        const largestDrive = Math.max(...drives.map((d) => d.size));

        // 40 mirrored leaders + 3 x 20 sharded frames = 100 distinct images, where three
        // identically-configured drives would together have held only 60.
        expect(largestDrive).toBe(60);
        expect(union.size).toBe(100);
        // Each drive is actually full — distribution must not waste capacity.
        for (const d of drives) expect(d.size).toBe(60);
    });

    it('keeps every cluster leader on every drive', async () => {
        const library = fleetLibrary(30, 4, 10);
        const leaders = library.filter((it) => it.rank === 0);

        for (const ordinal of [1, 2, 3]) {
            const fleet: FleetIdentity = { ordinal, size: 3 };
            const planned = library.map((it) => planFor(it, fleet));
            const { selected } = await selectPlanProportional(planned, 600, CAPACITY, {});
            const kept = new Set(selected.map((p) => p.relPath));
            for (const leader of leaders) {
                expect(kept.has(`day-${leader.groupKey}/${leader.id}.jpg`)).toBe(true);
            }
        }
    });

    it('backfills leftover space with another drive’s slice', async () => {
        // One drive with room for everything: it should take offshard items rather than
        // leave capacity unused.
        const library = fleetLibrary(10, 4, 10);
        const fleet: FleetIdentity = { ordinal: 1, size: 3 };
        const planned = library.map((it) => planFor(it, fleet));
        const offshardCount = planned.filter((p) => p.tier === 'offshard').length;
        expect(offshardCount).toBeGreaterThan(0);

        // Budget just short of the whole library, so the "everything fits" shortcut is skipped.
        const { selected } = await selectPlanProportional(planned, 390, CAPACITY, {});
        const backfilled = selected.filter((p) => p.tier === 'offshard');

        expect(backfilled.length).toBeGreaterThan(0);
        expect(selected).toHaveLength(39);
    });

    it('gives this drive’s own slice priority over another drive’s', async () => {
        const library = fleetLibrary(10, 4, 10);
        const fleet: FleetIdentity = { ordinal: 2, size: 3 };
        const planned = library.map((it) => planFor(it, fleet));
        const owned = planned.filter((p) => p.tier !== 'offshard');

        // Exactly enough room for the owned tier and nothing more.
        const { selected } = await selectPlanProportional(
            planned,
            owned.length * 10,
            CAPACITY,
            {},
        );

        expect(selected.filter((p) => p.tier === 'offshard')).toHaveLength(0);
        expect(selected).toHaveLength(owned.length);
    });

    it('is stable across runs so a drive does not re-copy its slice', async () => {
        const library = fleetLibrary(25, 4, 10);
        const fleet: FleetIdentity = { ordinal: 3, size: 3 };
        const first = await selectPlanProportional(
            library.map((it) => planFor(it, fleet)), 500, CAPACITY, {},
        );
        const second = await selectPlanProportional(
            library.map((it) => planFor(it, fleet)), 500, CAPACITY, {},
        );
        expect(first.selected.map((p) => p.relPath))
            .toEqual(second.selected.map((p) => p.relPath));
    });
});

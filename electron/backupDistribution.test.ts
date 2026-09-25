import { describe, expect, it } from 'vitest';
import {
    assignShard,
    clusterGroupKey,
    fnv1a32,
    isDistributed,
    MAX_FLEET_SIZE,
    parseFleetIdentity,
    placementTier,
    type FleetIdentity,
} from './backupDistribution';
import type { BackupManifest } from './types';

const manifestWith = (fields: Partial<BackupManifest>): BackupManifest => ({
    updatedAt: '2026-01-01T00:00:00.000Z',
    images: [],
    ...fields,
});

describe('parseFleetIdentity', () => {
    it('defaults to standalone when the manifest declares nothing', () => {
        expect(parseFleetIdentity(manifestWith({}))).toEqual({ ordinal: 1, size: 1 });
    });

    it('defaults to standalone when only one of the two fields is set', () => {
        expect(parseFleetIdentity(manifestWith({ fleetSize: 3 }))).toEqual({ ordinal: 1, size: 1 });
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: 2 }))).toEqual({ ordinal: 1, size: 1 });
    });

    it('reads a declared fleet position', () => {
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: 2, fleetSize: 3 })))
            .toEqual({ ordinal: 2, size: 3 });
    });

    it('clamps an ordinal past the end of the fleet', () => {
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: 9, fleetSize: 3 })))
            .toEqual({ ordinal: 3, size: 3 });
    });

    it('rejects zero, negative, and non-finite values', () => {
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: 0, fleetSize: 3 })))
            .toEqual({ ordinal: 1, size: 1 });
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: -1, fleetSize: -3 })))
            .toEqual({ ordinal: 1, size: 1 });
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: 1, fleetSize: NaN })))
            .toEqual({ ordinal: 1, size: 1 });
    });

    it('rejects an absurd fleet size', () => {
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: 1, fleetSize: MAX_FLEET_SIZE + 1 })))
            .toEqual({ ordinal: 1, size: 1 });
    });

    it('floors fractional values', () => {
        expect(parseFleetIdentity(manifestWith({ driveOrdinal: 2.7, fleetSize: 3.9 })))
            .toEqual({ ordinal: 2, size: 3 });
    });

    it('handles a missing manifest', () => {
        expect(parseFleetIdentity(undefined)).toEqual({ ordinal: 1, size: 1 });
    });
});

describe('fnv1a32', () => {
    it('is stable for a fixed key', () => {
        // Stability is load-bearing: a drive must derive the same shard next run or it
        // would re-copy its entire slice.
        expect(fnv1a32('cluster:42')).toBe(fnv1a32('cluster:42'));
        expect(fnv1a32('')).toBe(0x811c9dc5);
    });

    it('matches known FNV-1a 32 vectors', () => {
        expect(fnv1a32('a')).toBe(0xe40c292c);
        expect(fnv1a32('foobar')).toBe(0xbf9cf968);
    });

    it('separates similar keys', () => {
        expect(fnv1a32('cluster:1')).not.toBe(fnv1a32('cluster:2'));
    });
});

describe('assignShard', () => {
    it('always returns drive 0 for a standalone fleet', () => {
        expect(assignShard(5, 'cluster:1', 1)).toBe(0);
    });

    it('is within range and deterministic', () => {
        for (let rank = 0; rank < 10; rank++) {
            const shard = assignShard(rank, 'cluster:77', 3);
            expect(shard).toBeGreaterThanOrEqual(0);
            expect(shard).toBeLessThan(3);
            expect(shard).toBe(assignShard(rank, 'cluster:77', 3));
        }
    });

    it('gives consecutive ranks of one cluster to different drives', () => {
        const shards = [1, 2, 3].map((rank) => assignShard(rank, 'cluster:5', 3));
        expect(new Set(shards).size).toBe(3);
    });

    it('spreads rank 1 roughly evenly across drives', () => {
        // Without the group-key stagger, drive 1 would own rank 1 of every cluster.
        const counts = [0, 0, 0];
        for (let id = 0; id < 1200; id++) {
            counts[assignShard(1, clusterGroupKey([id]), 3)]++;
        }
        for (const c of counts) {
            expect(c).toBeGreaterThan(300);
            expect(c).toBeLessThan(500);
        }
    });
});

describe('clusterGroupKey', () => {
    it('keys on the lowest member id regardless of order', () => {
        expect(clusterGroupKey([9, 3, 7])).toBe('cluster:3');
        expect(clusterGroupKey([3, 7, 9])).toBe('cluster:3');
    });

    it('degrades gracefully on an empty cluster', () => {
        expect(clusterGroupKey([])).toBe('cluster:unknown');
    });
});

describe('placementTier', () => {
    const solo: FleetIdentity = { ordinal: 1, size: 1 };

    it('treats every item as this drive on a standalone destination', () => {
        expect(placementTier({ isPick: false, rank: 4, groupKey: 'cluster:1' }, solo)).toBe('shard');
        expect(placementTier({ isPick: true, rank: 0, groupKey: 'cluster:1' }, solo)).toBe('shard');
        expect(isDistributed(solo)).toBe(false);
    });

    it('mirrors curated picks to every drive', () => {
        for (let ordinal = 1; ordinal <= 3; ordinal++) {
            expect(placementTier(
                { isPick: true, rank: 4, groupKey: 'cluster:1' },
                { ordinal, size: 3 },
            )).toBe('mirror');
        }
    });

    it('mirrors each cluster leader to every drive', () => {
        for (let ordinal = 1; ordinal <= 3; ordinal++) {
            expect(placementTier(
                { isPick: false, rank: 0, groupKey: 'cluster:1' },
                { ordinal, size: 3 },
            )).toBe('mirror');
        }
    });

    it('gives every non-leader to exactly one drive', () => {
        const owners = [1, 2, 3].filter((ordinal) => placementTier(
            { isPick: false, rank: 2, groupKey: 'cluster:88' },
            { ordinal, size: 3 },
        ) === 'shard');
        expect(owners).toHaveLength(1);
    });

    it('marks the other drives offshard for the same item', () => {
        const tiers = [1, 2, 3].map((ordinal) => placementTier(
            { isPick: false, rank: 2, groupKey: 'cluster:88' },
            { ordinal, size: 3 },
        ));
        expect(tiers.filter((t) => t === 'offshard')).toHaveLength(2);
    });

    it('produces disjoint shards and a shared mirror set across a whole library', () => {
        const candidates = Array.from({ length: 900 }, (_, i) => ({
            isPick: i % 50 === 0,
            rank: i % 4,
            groupKey: clusterGroupKey([Math.floor(i / 4)]),
        }));

        const perDrive = [1, 2, 3].map((ordinal) =>
            candidates.filter((c) => placementTier(c, { ordinal, size: 3 }) !== 'offshard'));

        const mirrored = candidates.filter((c) => c.isPick || c.rank === 0);
        for (const drive of perDrive) {
            // Every mirrored item is present on every drive.
            expect(drive.filter((c) => c.isPick || c.rank === 0)).toHaveLength(mirrored.length);
        }

        // The non-mirrored slices are disjoint and together cover everything.
        const slices = perDrive.map((drive) =>
            new Set(drive.filter((c) => !c.isPick && c.rank > 0).map((c) => `${c.groupKey}#${c.rank}`)));
        const union = new Set([...slices[0], ...slices[1], ...slices[2]]);
        const totalSliceSize = slices.reduce((sum, s) => sum + s.size, 0);
        expect(union.size).toBe(totalSliceSize);
        expect(union.size).toBe(
            new Set(candidates.filter((c) => !c.isPick && c.rank > 0)
                .map((c) => `${c.groupKey}#${c.rank}`)).size,
        );
    });
});

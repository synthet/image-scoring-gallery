/**
 * Fleet distribution: spread a library across several backup drives that are each too
 * small to hold it all.
 *
 * Each drive declares `driveOrdinal` / `fleetSize` in its own `manifest.json`. Every
 * candidate is then placed in one of three tiers for *that* drive:
 *
 *   mirror   — curated picks and each cluster's rank-0 keeper: copied to every drive, so
 *              the best frame of a burst survives losing any single drive.
 *   shard    — rank >= 1 keepers whose shard index matches this drive: its exclusive slice.
 *   offshard — rank >= 1 keepers owned by another drive: backfill only, if space remains.
 *
 * With `fleetSize <= 1` everything is `shard`, which reproduces the single-drive behaviour
 * exactly.
 */

import type { BackupManifest } from './types';

export type FleetIdentity = {
    /** 1-based position of this drive in the fleet. */
    ordinal: number;
    /** Total drives in the fleet. 1 = standalone (no distribution). */
    size: number;
};

export type PlacementTier = 'mirror' | 'shard' | 'offshard';

/** A drive that is not part of a fleet — selection behaves exactly as before. */
export const SOLO_FLEET: FleetIdentity = { ordinal: 1, size: 1 };

/** Upper bound on fleet size; guards against a typo turning the manifest into nonsense. */
export const MAX_FLEET_SIZE = 64;

function toPositiveInt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const n = Math.floor(value);
    return n >= 1 ? n : null;
}

/**
 * Read the fleet identity a destination manifest declares.
 *
 * Anything missing, malformed, or out of range degrades to {@link SOLO_FLEET} rather than
 * guessing: a drive that has not been told its position must keep behaving like a full
 * standalone backup, never silently claim drive 1's slice.
 */
export function parseFleetIdentity(
    manifest: Pick<BackupManifest, 'driveOrdinal' | 'fleetSize'> | undefined | null,
): FleetIdentity {
    if (!manifest) return { ...SOLO_FLEET };
    const size = toPositiveInt(manifest.fleetSize);
    const ordinal = toPositiveInt(manifest.driveOrdinal);
    if (size === null || ordinal === null) return { ...SOLO_FLEET };
    if (size > MAX_FLEET_SIZE) return { ...SOLO_FLEET };
    return { ordinal: Math.min(size, ordinal), size };
}

/** True when this identity actually splits work across drives. */
export function isDistributed(fleet: FleetIdentity): boolean {
    return fleet.size > 1;
}

/**
 * FNV-1a (32-bit). Deterministic across runs, processes, and machines — which is the whole
 * point: every drive must derive the same shard assignment from the same group key without
 * any coordination, and the same drive must derive the same one next run or it would
 * re-copy its entire slice.
 */
export function fnv1a32(key: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        // 32-bit FNV prime multiply via shifts (avoids float precision loss of `* 16777619`).
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash >>> 0;
}

/**
 * Which drive owns rank `rank` of the cluster identified by `groupKey`.
 *
 * The `fnv1a32(groupKey)` term staggers the starting drive per cluster. Without it drive 1
 * would own rank 1 of *every* cluster and drive 3 would only ever see clusters with four or
 * more keepers, starving it whenever bursts are short.
 */
export function assignShard(rank: number, groupKey: string, fleetSize: number): number {
    if (fleetSize <= 1) return 0;
    const r = Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : 0;
    return (r + fnv1a32(groupKey)) % fleetSize;
}

export type PlacementInput = {
    /** Curated pick (pick_status Green|Blue|Purple) — always mirrored. */
    isPick: boolean;
    /** 0-based rank within its similarity cluster; 0 is the cluster's primary keeper. */
    rank: number;
    /** Stable cluster identity (see `clusterGroupKey`). */
    groupKey: string;
};

/** Tier for one candidate on one drive. */
export function placementTier(item: PlacementInput, fleet: FleetIdentity): PlacementTier {
    if (!isDistributed(fleet)) return 'shard';
    if (item.isPick || item.rank <= 0) return 'mirror';
    return assignShard(item.rank, item.groupKey, fleet.size) === fleet.ordinal - 1
        ? 'shard'
        : 'offshard';
}

/**
 * Stable identity for a similarity cluster: its lowest member image id.
 *
 * Content-derived on purpose. A run-order index (`date#3`) would shift whenever a cluster
 * appears or disappears, reshuffling every downstream shard assignment and forcing a full
 * re-copy on the next run.
 */
export function clusterGroupKey(memberIds: readonly number[]): string {
    let min = Number.POSITIVE_INFINITY;
    for (const id of memberIds) {
        if (id < min) min = id;
    }
    return Number.isFinite(min) ? `cluster:${min}` : 'cluster:unknown';
}

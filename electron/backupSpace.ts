/**
 * Backup destination space: volume stats, XMP sidecar helpers, stale cleanup,
 * and proportional per-folder selection so every date-folder gets representation.
 */

import fs from 'fs';
import path from 'path';
import type { BackupManifest, BackupManifestEntry, ScoredImageForBackup } from './types';
import { selectWithMmrBudget, type MmrItem } from './backupDiversity';

/** Fraction of total volume capacity reserved as free-space buffer. */
export const BACKUP_BUFFER_FRACTION = 0.02;

export type BackupPlannedItem = {
    img: ScoredImageForBackup;
    /** Normalized path for fs.stat / copyFile (repairs WSL and D:\\mnt\\d\\... shapes on Windows). */
    sourcePath: string;
    relPath: string;
    destPath: string;
    fileName: string;
    score: number;
    sourceSize: number;
    /** Size of the source .xmp sidecar (0 when absent). */
    sourceXmpSize: number;
    /** After comparing manifest + on-disk size */
    skipCopy: boolean;
    /** Whether the destination .xmp sidecar already matches the source. */
    skipCopyXmp: boolean;
    /** Date-group key (e.g. "2024-03-15") used for proportional per-folder selection. */
    leafFolder: string;
    /** Optional embedding for MMR space selection. */
    embedding?: Float32Array;
};

/**
 * Derive the XMP sidecar path for a given image path.
 * Convention: same directory, same basename, `.xmp` extension.
 */
export function xmpSidecarPath(filePath: string): string {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    return path.join(dir, `${base}.xmp`);
}

/**
 * Free space on the volume containing `targetDir` (Node `fs.statfs`).
 * Returns null if unavailable (very old Node / unexpected FS).
 */
export async function getVolumeFreeBytes(targetDir: string): Promise<number | null> {
    try {
        const s = await fs.promises.statfs(targetDir);
        const free = Number(s.bavail) * Number(s.bsize);
        return Number.isFinite(free) && free >= 0 ? free : null;
    } catch {
        return null;
    }
}

/**
 * Total capacity of the volume containing `targetDir`.
 * Returns null if unavailable.
 */
export async function getVolumeCapacityBytes(targetDir: string): Promise<number | null> {
    try {
        const s = await fs.promises.statfs(targetDir);
        const total = Number(s.blocks) * Number(s.bsize);
        return Number.isFinite(total) && total > 0 ? total : null;
    } catch {
        return null;
    }
}

/**
 * Manifest rows no longer in the current plan (does not touch files on disk).
 */
export function pruneStaleManifestEntries(
    manifest: BackupManifest,
    desiredRelPaths: Set<string>,
): number {
    const before = manifest.images.length;
    manifest.images = manifest.images.filter((entry) => desiredRelPaths.has(entry.relPath));
    return before - manifest.images.length;
}

export type StaleRemovalOptions = {
    /** When false, prebuild entries (id === 0) are never unlinked. */
    allowPrebuildDelete: boolean;
};

export type StaleRemovalStats = {
    /** Manifest rows not in the current plan. */
    staleManifestCount: number;
    /** Files that would be or were unlinked from disk. */
    wouldDeleteFiles: number;
    /** Stale entries protected because id === 0 and prebuild delete disallowed. */
    prebuildProtectedCount: number;
    staleEntries: BackupManifestEntry[];
};

/** Analyze manifest entries absent from the current plan. */
export function analyzeStaleManifestEntries(
    manifest: BackupManifest,
    desiredRelPaths: Set<string>,
    options: StaleRemovalOptions,
): StaleRemovalStats {
    const staleEntries: BackupManifestEntry[] = [];
    let prebuildProtectedCount = 0;

    for (const entry of manifest.images) {
        if (desiredRelPaths.has(entry.relPath)) continue;
        staleEntries.push(entry);
        if (entry.id === 0 && !options.allowPrebuildDelete) {
            prebuildProtectedCount++;
        }
    }

    const wouldDeleteFiles = staleEntries.filter(
        (entry) => options.allowPrebuildDelete || entry.id !== 0,
    ).length;

    return {
        staleManifestCount: staleEntries.length,
        wouldDeleteFiles,
        prebuildProtectedCount,
        staleEntries,
    };
}

/**
 * Unlink stale backup files from disk (optional; use after analyzeStaleManifestEntries).
 */
export async function unlinkStaleBackupFiles(
    targetPath: string,
    staleEntries: BackupManifestEntry[],
    options: StaleRemovalOptions,
): Promise<number> {
    let removed = 0;
    for (const entry of staleEntries) {
        if (entry.id === 0 && !options.allowPrebuildDelete) continue;
        const abs = path.join(targetPath, entry.relPath);
        await fs.promises.unlink(abs).catch(() => {});
        await fs.promises.unlink(xmpSidecarPath(abs)).catch(() => {});
        removed++;
    }
    return removed;
}

/**
 * Sync manifest with plan and optionally delete stale files from disk.
 */
export async function syncStaleBackupEntries(
    targetPath: string,
    manifest: BackupManifest,
    desiredRelPaths: Set<string>,
    pruneFiles: boolean,
    confirmMassDelete: boolean,
): Promise<{ manifestPruned: number; filesRemoved: number; prebuildProtectedCount: number }> {
    const allowPrebuildDelete = pruneFiles && confirmMassDelete;
    const stats = analyzeStaleManifestEntries(manifest, desiredRelPaths, { allowPrebuildDelete });

    const manifestPruned = pruneStaleManifestEntries(manifest, desiredRelPaths);

    let filesRemoved = 0;
    if (pruneFiles) {
        filesRemoved = await unlinkStaleBackupFiles(targetPath, stats.staleEntries, { allowPrebuildDelete });
    }

    return {
        manifestPruned,
        filesRemoved,
        prebuildProtectedCount: stats.prebuildProtectedCount,
    };
}

export type SelectPlanOptions = {
    /** When set and < 1, global backfill uses MMR instead of pure score. */
    diversityLambda?: number;
};

/**
 * Proportional per-folder selection.
 *
 * Every leaf-folder (date group) gets `max(1, ceil(count * fillRatio))` of its
 * highest-scoring images. Remaining budget is filled greedily by global score or MMR.
 * If even the minimums exceed the budget the lowest-scoring guaranteed items
 * are dropped until the plan fits.
 *
 * Skip-copy items are always included and do not consume the free-space budget
 * (they are already on disk).
 */
export function selectPlanProportional(
    planned: BackupPlannedItem[],
    freeBytes: number,
    capacityBytes: number,
    options: SelectPlanOptions = {},
): { selected: BackupPlannedItem[]; droppedRelPaths: string[] } {
    const bufferBytes = capacityBytes * BACKUP_BUFFER_FRACTION;

    // Separate skip-copy (both image + xmp already on disk) from need-copy.
    const skipItems: BackupPlannedItem[] = [];
    const needCopy: BackupPlannedItem[] = [];
    for (const p of planned) {
        if (p.skipCopy && p.skipCopyXmp) {
            skipItems.push(p);
        } else {
            needCopy.push(p);
        }
    }

    const itemBytes = (p: BackupPlannedItem): number => {
        let bytes = 0;
        if (!p.skipCopy) bytes += p.sourceSize;
        if (!p.skipCopyXmp && p.sourceXmpSize > 0) bytes += p.sourceXmpSize;
        return bytes;
    };

    const totalNewBytes = needCopy.reduce((sum, p) => sum + itemBytes(p), 0);
    const usableBytes = Math.max(0, freeBytes - bufferBytes);

    // If everything fits, keep it all.
    if (totalNewBytes <= usableBytes) {
        return { selected: [...skipItems, ...needCopy], droppedRelPaths: [] };
    }

    // ---- Proportional per-folder selection ----

    const fillRatio = usableBytes > 0 && totalNewBytes > 0
        ? Math.min(1, usableBytes / totalNewBytes)
        : 0;

    // Group need-copy items by leafFolder, each group sorted by score desc.
    const groups = new Map<string, BackupPlannedItem[]>();
    for (const p of needCopy) {
        const key = p.leafFolder;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
    }
    for (const items of groups.values()) {
        items.sort((a, b) => b.score - a.score);
    }

    // Phase 1: Guaranteed selection — top N per folder.
    const guaranteed: BackupPlannedItem[] = [];
    const unselected: BackupPlannedItem[] = [];
    for (const items of groups.values()) {
        const keep = Math.max(1, Math.ceil(items.length * fillRatio));
        guaranteed.push(...items.slice(0, keep));
        unselected.push(...items.slice(keep));
    }

    let usedBytes = guaranteed.reduce((s, p) => s + itemBytes(p), 0);

    // Phase 2: Global backfill — add highest-scoring (or MMR) unselected if space remains.
    const backfilled: BackupPlannedItem[] = [];
    const remainingBudget = Math.max(0, usableBytes - usedBytes);
    if (remainingBudget > 0 && unselected.length > 0) {
        const useMmr =
            options.diversityLambda != null &&
            options.diversityLambda < 1 &&
            unselected.some((p) => p.embedding);

        if (useMmr) {
            type BudgetItem = MmrItem & { bytes: number; plan: BackupPlannedItem };
            const candidates: BudgetItem[] = unselected.map((p) => ({
                id: p.img.id,
                score: p.score,
                embedding: p.embedding,
                bytes: itemBytes(p),
                plan: p,
            }));
            const mmrPicked = selectWithMmrBudget(
                candidates,
                remainingBudget,
                options.diversityLambda ?? 0.7,
            );
            for (const c of mmrPicked) {
                backfilled.push(c.plan);
                usedBytes += c.bytes;
            }
        } else {
            unselected.sort((a, b) => b.score - a.score);
            for (const p of unselected) {
                const b = itemBytes(p);
                if (usedBytes + b <= usableBytes) {
                    backfilled.push(p);
                    usedBytes += b;
                }
            }
        }
    }

    // Phase 3: Overflow — if guaranteed minimums exceed budget,
    // fall back to global score-based or MMR selection across ALL candidates.
    let selected = [...guaranteed, ...backfilled];
    if (usedBytes > usableBytes) {
        const allCandidates = [...needCopy];
        const useMmr =
            options.diversityLambda != null &&
            options.diversityLambda < 1 &&
            allCandidates.some((p) => p.embedding);

        if (useMmr) {
            type BudgetItem = MmrItem & { bytes: number; plan: BackupPlannedItem };
            const candidates: BudgetItem[] = allCandidates.map((p) => ({
                id: p.img.id,
                score: p.score,
                embedding: p.embedding,
                bytes: itemBytes(p),
                plan: p,
            }));
            const mmrPicked = selectWithMmrBudget(candidates, usableBytes, options.diversityLambda ?? 0.7);
            selected = mmrPicked.map((c) => c.plan);
        } else {
            allCandidates.sort((a, b) => b.score - a.score);
            let trimmedBytes = 0;
            const trimmed: BackupPlannedItem[] = [];
            for (const p of allCandidates) {
                const b = itemBytes(p);
                if (trimmedBytes + b <= usableBytes) {
                    trimmed.push(p);
                    trimmedBytes += b;
                }
            }
            selected = trimmed;
        }
    }

    const selectedSet = new Set(selected.map(p => p.relPath));
    const droppedRelPaths = needCopy
        .filter(p => !selectedSet.has(p.relPath))
        .map(p => p.relPath);

    return { selected: [...skipItems, ...selected], droppedRelPaths };
}

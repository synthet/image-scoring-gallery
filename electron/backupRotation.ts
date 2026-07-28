/**
 * Opt-in score-based rotation: admit dropped high-score candidates by evicting
 * lower-scoring resident files (never prebuild id===0).
 */

import type { BackupManifestEntry } from './types';
import type { BackupPlannedItem } from './backupSpace';

export type ResidentFile = {
    entry: BackupManifestEntry;
    size: number;
};

export type PlanRotationOptions = {
    scoreMargin: number;
};

export type PlanRotationResult = {
    evict: ResidentFile[];
    admit: BackupPlannedItem[];
    freedBytes: number;
};

function itemBytes(p: BackupPlannedItem): number {
    let bytes = 0;
    if (!p.skipCopy) bytes += p.sourceSize;
    if (!p.skipCopyXmp && p.sourceXmpSize > 0) bytes += p.sourceXmpSize;
    return bytes;
}

/**
 * Greedy pairing: dropped (score desc) vs resident (score asc, excluding id===0).
 * Evict while incoming.score − resident.score >= scoreMargin and freed bytes
 * are still needed for the next admittee.
 */
export function planRotation(
    dropped: BackupPlannedItem[],
    resident: ResidentFile[],
    options: PlanRotationOptions,
): PlanRotationResult {
    const margin = options.scoreMargin;
    const incoming = [...dropped].sort((a, b) => b.score - a.score);
    const residents = resident
        .filter((r) => r.entry.id !== 0)
        .sort((a, b) => a.entry.score - b.entry.score);

    const evict: ResidentFile[] = [];
    const admit: BackupPlannedItem[] = [];
    let freedBytes = 0;
    let usedFreed = 0;
    let ri = 0;

    for (const cand of incoming) {
        const need = itemBytes(cand);
        while (usedFreed + need > freedBytes && ri < residents.length) {
            const res = residents[ri];
            if (cand.score - res.entry.score < margin) break;
            evict.push(res);
            freedBytes += Math.max(0, res.size);
            ri++;
        }
        if (need > 0 && usedFreed + need <= freedBytes) {
            admit.push(cand);
            usedFreed += need;
        } else if (need === 0) {
            // Zero-byte (fully skip-copy) items do not need eviction space.
            admit.push(cand);
        }
    }

    return { evict, admit, freedBytes };
}

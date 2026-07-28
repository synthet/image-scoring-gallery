/**
 * Pure manifest↔disk reconciliation reporting for Backup destination truth.
 */

import type { BackupManifest } from './types';

export type ManifestDiskReport = {
    manifestRows: number;
    presentOnDisk: number;
    /** Manifest rows whose file is missing on disk. */
    missingOnDisk: number;
    /** Bytes the manifest claims for missing rows. */
    missingBytes: number;
    /** Of missing rows, how many are prebuild (id === 0). */
    missingPrebuild: number;
    /** Files on disk with no matching manifest row. */
    orphanFiles: number;
    /** Directories that contain only .xmp sidecars (reported, never auto-deleted). */
    xmpOnlyDirs: number;
};

function normalizeRelKey(relPath: string): string {
    return relPath.replace(/\\/g, '/').toLowerCase();
}

/**
 * Compare a manifest to a pre-collected set of on-disk relative paths (case-insensitive).
 * Pure — callers walk the destination separately.
 */
export function reconcileManifestWithDiskReport(
    manifest: BackupManifest,
    onDisk: ReadonlySet<string>,
    options?: { xmpOnlyDirs?: number },
): ManifestDiskReport {
    const diskKeys = new Set([...onDisk].map(normalizeRelKey));
    const manifestKeys = new Set<string>();

    let presentOnDisk = 0;
    let missingOnDisk = 0;
    let missingBytes = 0;
    let missingPrebuild = 0;

    for (const entry of manifest.images) {
        const key = normalizeRelKey(entry.relPath);
        manifestKeys.add(key);
        if (diskKeys.has(key)) {
            presentOnDisk++;
        } else {
            missingOnDisk++;
            missingBytes += entry.size > 0 ? entry.size : 0;
            if (entry.id === 0) missingPrebuild++;
        }
    }

    let orphanFiles = 0;
    for (const key of diskKeys) {
        if (!manifestKeys.has(key)) orphanFiles++;
    }

    return {
        manifestRows: manifest.images.length,
        presentOnDisk,
        missingOnDisk,
        missingBytes,
        missingPrebuild,
        orphanFiles,
        xmpOnlyDirs: options?.xmpOnlyDirs ?? 0,
    };
}

/** True when missing rows are large enough that free-bytes math from the manifest is fiction. */
export function reconcileHasSignificantDrift(report: ManifestDiskReport): boolean {
    if (report.manifestRows === 0) return false;
    if (report.missingOnDisk >= 100) return true;
    return report.missingOnDisk / report.manifestRows >= 0.1;
}

/**
 * Shared backup selection + layout planning (used by preview and run).
 */

import fs from 'fs';
import path from 'path';
import type { BackupConfig } from './backupConfig';
import { effectiveMaxPerCluster } from './backupConfig';
import {
    applyCrossDayDedup,
    backupDateKey,
    backupYearFromDateKey,
    deduplicateByDateGroups,
} from './backupSelection';
import type { BackupPlannedItem } from './backupSpace';
import { BACKUP_BUFFER_FRACTION, xmpSidecarPath } from './backupSpace';
import * as db from './db';
import type { BackupRejectReason, ScoredImageForBackup } from './types';

export type BackupPlanBuildResult = {
    allScored: ScoredImageForBackup[];
    toBackup: ScoredImageForBackup[];
    planned: BackupPlannedItem[];
    rejectedCount: number;
    warnings: string[];
    roughFillRatio: number;
    maxPerCluster: number;
    skippedLayout: number;
    rejectReasons: Partial<Record<BackupRejectReason, number>>;
};

export type BackupPlanBuildOptions = {
    targetPath: string;
    backupConfig: BackupConfig;
    freeBytes: number;
    capacityBytes: number;
    normalizeCameraModel: (model?: string | null) => string;
    normalizeLensFolderName: (lens?: string | null) => string;
    isUnresolvedSyncLayout: (camera: string, lens: string) => boolean;
    toWindowsLocalFsPath: (p: string) => string;
    /** Progress callback for the (potentially long) embedding-dedup pass. */
    onDedupProgress?: (current: number, total: number, detail: string) => void;
    /**
     * Destination disk map (relPath → size) from scanBackupDestination.
     * Used to exclude already-present candidates from the fill-ratio denominator.
     */
    presentRelPaths?: ReadonlySet<string>;
};

const AVG_RAW_BYTES_FALLBACK = 30 * 1024 * 1024;
const SAMPLE_SIZE = 200;

function normalizeRelKey(relPath: string): string {
    return relPath.replace(/\\/g, '/').toLowerCase();
}

/** Sample mean source file size for fill-ratio estimation. */
export async function sampleMeanSourceBytes(
    paths: string[],
    sampleSize = SAMPLE_SIZE,
): Promise<number> {
    if (paths.length === 0) return AVG_RAW_BYTES_FALLBACK;
    const n = Math.min(sampleSize, paths.length);
    const indices = new Set<number>();
    while (indices.size < n) {
        indices.add(Math.floor(Math.random() * paths.length));
    }
    let sum = 0;
    let counted = 0;
    for (const i of indices) {
        try {
            const st = await fs.promises.stat(paths[i]);
            if (st.size > 0) {
                sum += st.size;
                counted++;
            }
        } catch {
            /* skip */
        }
    }
    return counted > 0 ? sum / counted : AVG_RAW_BYTES_FALLBACK;
}

export async function buildBackupPlan(options: BackupPlanBuildOptions): Promise<BackupPlanBuildResult> {
    const {
        targetPath,
        backupConfig,
        freeBytes,
        capacityBytes,
        normalizeCameraModel,
        normalizeLensFolderName,
        isUnresolvedSyncLayout,
        toWindowsLocalFsPath,
        onDedupProgress,
        presentRelPaths,
    } = options;

    const warnings: string[] = [];
    const allScored = await db.getAllScoredImagesForBackup(
        backupConfig.minScore,
        { includeCurated: backupConfig.includeCurated },
    );
    const totalImages = allScored.length;

    const reserve =
        capacityBytes < Number.MAX_SAFE_INTEGER
            ? capacityBytes * (backupConfig.reserveFraction ?? BACKUP_BUFFER_FRACTION)
            : 0;
    const usableEstimate = Math.max(0, freeBytes - reserve);

    const samplePaths = allScored.map((img) => toWindowsLocalFsPath(img.path));
    const meanBytes = await sampleMeanSourceBytes(samplePaths);

    // Candidates already at destination consume no budget.
    let presentCount = 0;
    if (presentRelPaths && presentRelPaths.size > 0) {
        const presentKeys = new Set([...presentRelPaths].map(normalizeRelKey));
        for (const img of allScored) {
            const fileName = path.basename(img.path);
            // We don't know layout yet; approximate by checking if any disk path ends with the file name.
            // Prefer exact planned relPaths when available later — for estimator, count by basename presence.
            for (const key of presentKeys) {
                if (key.endsWith('/' + fileName.toLowerCase()) || key.endsWith('\\' + fileName.toLowerCase()) || key === fileName.toLowerCase()) {
                    presentCount++;
                    break;
                }
            }
        }
    }
    const budgetCandidates = Math.max(1, totalImages - presentCount);
    const roughFillRatio = totalImages > 0
        ? Math.min(1, usableEstimate / (budgetCandidates * meanBytes))
        : 1;
    const maxPerCluster = effectiveMaxPerCluster(backupConfig.maxPerCluster, roughFillRatio);

    const groups = new Map<string, ScoredImageForBackup[]>();
    for (const img of allScored) {
        const date = backupDateKey(img);
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(img);
    }

    const dedupDeps = {
        fetchPairs: (ids: number[], threshold: number) => db.getSimilarPairsInGroup(ids, threshold),
        fetchEmbeddings: (ids: number[]) => db.getEmbeddingsBatch(ids),
    };

    const dedupResult = await deduplicateByDateGroups(
        groups,
        roughFillRatio,
        maxPerCluster,
        backupConfig.diversityLambda,
        backupConfig.pairBatchSize,
        dedupDeps,
        onDedupProgress,
    );
    warnings.push(...dedupResult.warnings);

    let selectedImages = dedupResult.selectedIds;
    let rejectedCount = dedupResult.rejectedCount;
    let toBackup = allScored.filter((img) => selectedImages.has(img.id));
    const rejectReasons: Partial<Record<BackupRejectReason, number>> = {
        stack: dedupResult.rejectReasons.stack,
        cluster: dedupResult.rejectReasons.cluster,
    };

    if (backupConfig.crossDayDedup && toBackup.length > 1) {
        const layoutDetailsCross = await db.getImageDetailsBatch(toBackup.map((img) => img.id));
        const layoutById = new Map<number, { camera: string; lens: string }>();
        for (const img of toBackup) {
            const details = layoutDetailsCross.get(img.id);
            layoutById.set(img.id, {
                camera: normalizeCameraModel(details?.exif_model),
                lens: normalizeLensFolderName(details?.exif_lens_model),
            });
        }

        const crossResult = await applyCrossDayDedup(
            toBackup,
            layoutById,
            maxPerCluster,
            backupConfig.diversityLambda,
            backupConfig.pairBatchSize,
            dedupDeps,
        );
        warnings.push(...crossResult.warnings);
        selectedImages = crossResult.selectedIds;
        rejectedCount += crossResult.rejectedCount;
        toBackup = toBackup.filter((img) => selectedImages.has(img.id));
    }

    const layoutDetails = await db.getImageDetailsBatch(toBackup.map((img) => img.id));
    const embeddingMap = await db.getEmbeddingsBatch(toBackup.map((img) => img.id));

    const planned: BackupPlannedItem[] = [];
    let skippedLayout = 0;
    let missingSource = 0;

    for (const img of toBackup) {
        const fileName = path.basename(img.path);
        const details = layoutDetails.get(img.id);
        const camera = normalizeCameraModel(details?.exif_model);
        const lens = normalizeLensFolderName(details?.exif_lens_model);
        if (isUnresolvedSyncLayout(camera, lens)) {
            skippedLayout++;
            continue;
        }
        const dateStr = backupDateKey(img);
        const year = backupYearFromDateKey(dateStr);
        const relDir = path.join(camera, lens, year, dateStr);
        const relPath = path.join(relDir, fileName);
        const destPath = path.join(targetPath, relPath);
        const sourcePath = toWindowsLocalFsPath(img.path);

        let stats;
        try {
            stats = await fs.promises.stat(sourcePath);
        } catch {
            skippedLayout++;
            missingSource++;
            continue;
        }

        let sourceXmpSize = 0;
        try {
            const xmpStats = await fs.promises.stat(xmpSidecarPath(sourcePath));
            sourceXmpSize = xmpStats.size;
        } catch { /* no sidecar */ }

        planned.push({
            img,
            sourcePath,
            relPath,
            destPath,
            fileName,
            score: img.composite_score || 0,
            sourceSize: stats.size,
            sourceXmpSize,
            skipCopy: false,
            skipCopyXmp: sourceXmpSize === 0,
            leafFolder: dateStr,
            embedding: embeddingMap.get(img.id),
        });
    }

    rejectReasons.layout = skippedLayout - missingSource;
    rejectReasons['missing-source'] = missingSource;

    return {
        allScored,
        toBackup,
        planned,
        rejectedCount,
        warnings,
        roughFillRatio,
        maxPerCluster,
        skippedLayout,
        rejectReasons,
    };
}

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
import { createStageLog } from './stageLog';
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
     * Image ids already recorded in the destination manifest (adopted `id: 0` rows excluded).
     * Used to exclude already-present candidates from the fill-ratio denominator.
     *
     * Ids rather than paths: the layout (`camera/lens/year/date`) is not known this early, so
     * matching on filename collides across cameras and dates. A basename heuristic here once
     * reported 45,339 candidates "already at destination" against a destination holding only
     * 31,746 files, inflating `roughFillRatio` and hence `maxPerCluster`.
     */
    presentImageIds?: ReadonlySet<number>;
};

const AVG_RAW_BYTES_FALLBACK = 30 * 1024 * 1024;
const SAMPLE_SIZE = 200;

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
        presentImageIds,
    } = options;

    const log = createStageLog('BackupPlan');
    log.stage('querying scored images', { minScore: backupConfig.minScore });

    const warnings: string[] = [];
    const allScored = await db.getAllScoredImagesForBackup(
        backupConfig.minScore,
        { includeCurated: backupConfig.includeCurated },
    );
    const totalImages = allScored.length;
    log.stage('scored images loaded', { images: totalImages });

    const reserve =
        capacityBytes < Number.MAX_SAFE_INTEGER
            ? capacityBytes * (backupConfig.reserveFraction ?? BACKUP_BUFFER_FRACTION)
            : 0;
    const usableEstimate = Math.max(0, freeBytes - reserve);

    const samplePaths = allScored.map((img) => toWindowsLocalFsPath(img.path));
    const meanBytes = await sampleMeanSourceBytes(samplePaths);
    log.stage('sampled mean source size', { meanMiB: (meanBytes / 1024 ** 2).toFixed(1) });

    // Candidates already at destination consume no budget. Exact: a scored image is present
    // iff the manifest tracks it by id. Adopted rows (`id: 0`) are deliberately excluded —
    // they are untracked files on disk, not candidates competing for this run's budget.
    let presentCount = 0;
    if (presentImageIds && presentImageIds.size > 0) {
        for (const img of allScored) {
            if (presentImageIds.has(img.id)) presentCount++;
        }
    }
    const budgetCandidates = Math.max(1, totalImages - presentCount);
    const roughFillRatio = totalImages > 0
        ? Math.min(1, usableEstimate / (budgetCandidates * meanBytes))
        : 1;
    const maxPerCluster = effectiveMaxPerCluster(backupConfig.maxPerCluster, roughFillRatio);
    log.stage('budget estimated', {
        alreadyAtDestination: presentCount,
        budgetCandidates,
        roughFillRatio: roughFillRatio.toFixed(3),
        maxPerCluster,
    });

    const groups = new Map<string, ScoredImageForBackup[]>();
    for (const img of allScored) {
        const date = backupDateKey(img);
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(img);
    }
    log.stage('grouped by date', { dateGroups: groups.size });

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
    log.stage('date-group dedup', {
        selected: dedupResult.selectedIds.size,
        rejected: dedupResult.rejectedCount,
        byStack: dedupResult.rejectReasons.stack ?? 0,
        byCluster: dedupResult.rejectReasons.cluster ?? 0,
        warnings: dedupResult.warnings.length,
    });

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
        log.stage('cross-day dedup', {
            remaining: toBackup.length,
            rejected: crossResult.rejectedCount,
        });
    }

    const layoutDetails = await db.getImageDetailsBatch(toBackup.map((img) => img.id));
    const embeddingMap = await db.getEmbeddingsBatch(toBackup.map((img) => img.id));
    log.stage('layout metadata fetched', {
        images: toBackup.length,
        withExif: layoutDetails.size,
        withEmbedding: embeddingMap.size,
    });

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
    log.stage('plan ready', {
        planned: planned.length,
        skippedLayout: skippedLayout - missingSource,
        missingSource,
        totalSec: (log.totalMs() / 1000).toFixed(1),
    });

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

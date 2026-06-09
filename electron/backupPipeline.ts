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
import { xmpSidecarPath } from './backupSpace';
import * as db from './db';
import type { ScoredImageForBackup } from './types';

export type BackupPlanBuildResult = {
    allScored: ScoredImageForBackup[];
    toBackup: ScoredImageForBackup[];
    planned: BackupPlannedItem[];
    rejectedCount: number;
    warnings: string[];
    roughFillRatio: number;
    maxPerCluster: number;
    skippedLayout: number;
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
    fetchBackupPlanFromApi?: (
        roughFillRatio: number,
        maxPerCluster: number,
    ) => Promise<{
        imageIds: Set<number>;
        deduplicatedCount: number;
        warnings: string[];
    } | null>;
};

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
        fetchBackupPlanFromApi,
    } = options;

    const warnings: string[] = [];
    const allScored = await db.getAllScoredImagesForBackup(backupConfig.minScore);
    const totalImages = allScored.length;

    const AVG_RAW_BYTES = 30 * 1024 * 1024;
    const bufferBytes = capacityBytes < Number.MAX_SAFE_INTEGER ? capacityBytes * 0.02 : 0;
    const usableEstimate = Math.max(0, freeBytes - bufferBytes);
    const roughFillRatio = totalImages > 0
        ? Math.min(1, usableEstimate / (totalImages * AVG_RAW_BYTES))
        : 1;
    const maxPerCluster = effectiveMaxPerCluster(backupConfig.maxPerCluster, roughFillRatio);

    const groups = new Map<string, ScoredImageForBackup[]>();
    for (const img of allScored) {
        const date = backupDateKey(img);
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date)!.push(img);
    }

    let toBackup: ScoredImageForBackup[] = [];
    let rejectedCount = 0;

    const apiPlan = fetchBackupPlanFromApi
        ? await fetchBackupPlanFromApi(roughFillRatio, maxPerCluster)
        : null;
    if (apiPlan) {
        toBackup = allScored.filter((img) => apiPlan.imageIds.has(img.id));
        rejectedCount = apiPlan.deduplicatedCount;
        warnings.push(...apiPlan.warnings);
    } else {
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
        );
        warnings.push(...dedupResult.warnings);

        let selectedImages = dedupResult.selectedIds;
        rejectedCount = dedupResult.rejectedCount;
        toBackup = allScored.filter((img) => selectedImages.has(img.id));

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
    }

    const layoutDetails = await db.getImageDetailsBatch(toBackup.map((img) => img.id));
    const embeddingMap = await db.getEmbeddingsBatch(toBackup.map((img) => img.id));

    const planned: BackupPlannedItem[] = [];
    let skippedLayout = 0;

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

    return {
        allScored,
        toBackup,
        planned,
        rejectedCount,
        warnings,
        roughFillRatio,
        maxPerCluster,
        skippedLayout,
    };
}

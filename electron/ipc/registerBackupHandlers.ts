import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { BrowserWindow, IpcMain } from 'electron';
import { getConfigPath, loadAppConfig } from '../config';
import { buildBackupPlan } from '../backupPipeline';
import {
    reconcileManifestWithDiskReport,
    reconcileHasSignificantDrift,
} from '../backupAudit';
import {
    analyzeStaleManifestEntries,
    BACKUP_BUFFER_FRACTION,
    getVolumeCapacityBytes,
    getVolumeFreeBytes,
    pruneEmptyDirs,
    reconcileManifestWithDisk,
    scanBackupDestination,
    selectPlanProportional,
    syncStaleBackupEntries,
    xmpSidecarPath,
} from '../backupSpace';
import { planRotation } from '../backupRotation';
import {
    loadBackupConfig,
    requiresStaleDeleteConfirmation,
} from '../backupConfig';
import { resolveDriveId } from '../driveIdentity';
import { getDriveSessionStore } from '../driveSessionStore';
import { toWindowsLocalFsPath } from '../pathWinWsl';
import { normalizeLensFolderName } from '../lensFolderName';
import type {
    BackupManifest,
    BackupManifestEntry,
    BackupPreviewInfo,
    BackupProgress,
    BackupRejectReason,
    BackupResult,
    BackupRunOptions,
    BackupTargetInfo,
    BackupVerifyReport,
} from '../types';
import * as db from '../db';
import { wrapIpcHandler } from './wrapIpcHandler';
import type { SyncGuards } from '../main.handlers';

export type BackupHandlersDeps = {
    ipcMain: IpcMain;
    syncGuards: SyncGuards;
    getMainWindow: () => BrowserWindow | null;
    getIsBackupRunning: () => boolean;
    setIsBackupRunning: (v: boolean) => void;
    rebuildApplicationMenu: () => void;
    electronDirname: string;
    normalizeCameraModel: (raw: string | undefined | null) => string;
    isUnresolvedSyncLayout: (camera: string, lens: string) => boolean;
};

const MANIFEST_CHECKPOINT_INTERVAL = 250;

function normalizeRelKey(relPath: string): string {
    return relPath.replace(/\\/g, '/').toLowerCase();
}

export function registerBackupHandlers(deps: BackupHandlersDeps): void {
    const {
        ipcMain,
        getMainWindow,
        syncGuards,
        getIsBackupRunning,
        setIsBackupRunning,
        rebuildApplicationMenu,
        electronDirname,
        normalizeCameraModel,
        isUnresolvedSyncLayout,
    } = deps;
    const mainWindow = getMainWindow();

    async function loadBackupManifest(targetPath: string): Promise<{ manifest: BackupManifest; manifestPath: string }> {
        const manifestPath = path.join(targetPath, 'manifest.json');
        let manifest: BackupManifest = { updatedAt: new Date().toISOString(), images: [] };
        if (fs.existsSync(manifestPath)) {
            try {
                const content = await fs.promises.readFile(manifestPath, 'utf-8');
                manifest = JSON.parse(content);
            } catch { /* ignore corrupted manifest */ }
        }
        return { manifest, manifestPath };
    }

    /**
     * Atomically persist the manifest: write to a temp file, fsync, optionally rotate the
     * previous manifest to `.bak`, then rename into place.
     */
    async function writeManifestAtomic(
        manifestPath: string,
        manifest: BackupManifest,
        rotateBak = true,
    ): Promise<void> {
        const tmpPath = `${manifestPath}.tmp`;
        const data = JSON.stringify(manifest, null, 2);
        const handle = await fs.promises.open(tmpPath, 'w');
        try {
            await handle.writeFile(data, 'utf-8');
            await handle.sync();
        } finally {
            await handle.close();
        }
        if (rotateBak && fs.existsSync(manifestPath)) {
            await fs.promises.copyFile(manifestPath, `${manifestPath}.bak`).catch(() => {});
        }
        await fs.promises.rename(tmpPath, manifestPath);
    }

    async function resolveBackupVolumeStats(targetPath: string): Promise<{ freeBytes: number; capacityBytes: number }> {
        let freeBytes = await getVolumeFreeBytes(targetPath);
        let capacityBytes = await getVolumeCapacityBytes(targetPath);
        if (freeBytes === null || capacityBytes === null) {
            console.warn('[Main] Backup: could not read disk space; using unlimited budget.');
            freeBytes = freeBytes ?? Number.MAX_SAFE_INTEGER;
            capacityBytes = capacityBytes ?? Number.MAX_SAFE_INTEGER;
        }
        return { freeBytes, capacityBytes };
    }

    function computeUsableBytes(
        freeBytes: number,
        capacityBytes: number,
        reserveFraction: number,
    ): number {
        const reserve = Math.min(0.5, Math.max(0, reserveFraction));
        const bufferBytes = capacityBytes * reserve;
        return Math.max(0, freeBytes - bufferBytes);
    }

    function buildManifestIndex(manifest: BackupManifest): Map<string, number> {
        const index = new Map<string, number>();
        for (let i = 0; i < manifest.images.length; i++) {
            index.set(normalizeRelKey(manifest.images[i].relPath), i);
        }
        return index;
    }

    function diskEntryForKey(
        key: string,
        diskMap: Map<string, number>,
    ): { relPath: string; size: number } | undefined {
        for (const [relPath, size] of diskMap) {
            if (normalizeRelKey(relPath) === key) return { relPath, size };
        }
        return undefined;
    }

    async function resolveLastBackupSessionAt(targetPath: string): Promise<string | null | undefined> {
        try {
            const identity = await resolveDriveId(targetPath);
            const store = getDriveSessionStore(app.getPath('userData'));
            const session = await store.read(identity.driveId);
            return session?.backup?.lastBackupAt ?? null;
        } catch {
            return undefined;
        }
    }

    async function computeBackupPreview(targetPath: string): Promise<BackupPreviewInfo> {
        const appConfig = loadAppConfig(getConfigPath(electronDirname));
        const backupConfig = loadBackupConfig(appConfig.backup as Record<string, unknown> | undefined);
        const { manifest } = await loadBackupManifest(targetPath);
        const { freeBytes, capacityBytes } = await resolveBackupVolumeStats(targetPath);

        const fastPath = !backupConfig.pruneStaleFiles
            && !backupConfig.pruneDroppedForSpace
            && !backupConfig.rotateLowScores;

        if (fastPath) {
            return {
                minScore: backupConfig.minScore,
                candidateCount: await db.countScoredImagesForBackup(backupConfig.minScore, {
                    includeCurated: backupConfig.includeCurated,
                }),
                plannedCount: 0,
                plannedComputed: false,
                manifestCount: manifest.images.length,
                pruneStaleFiles: false,
                pruneDroppedForSpace: false,
                wouldDeleteFiles: 0,
                wouldDeleteDroppedForSpace: 0,
                prebuildProtectedCount: 0,
                requiresConfirm: false,
                manifestPrunedCount: 0,
                roughFillRatio: 0,
                wouldRotateOut: 0,
            };
        }

        const scan = await scanBackupDestination(targetPath);
        const planBuild = await buildBackupPlan({
            targetPath,
            backupConfig,
            freeBytes,
            capacityBytes,
            normalizeCameraModel,
            normalizeLensFolderName,
            isUnresolvedSyncLayout,
            toWindowsLocalFsPath,
            presentRelPaths: scan.diskKeys,
        });

        const desiredRelPaths = new Set(planBuild.planned.map((p) => p.relPath));
        const staleStats = analyzeStaleManifestEntries(manifest, desiredRelPaths, {
            allowPrebuildDelete: false,
        });
        const wouldDeleteFiles = backupConfig.pruneStaleFiles ? staleStats.wouldDeleteFiles : 0;

        const plannedWithSkip = planBuild.planned.map((p) => ({ ...p }));
        for (const p of plannedWithSkip) {
            const onDisk = diskEntryForKey(normalizeRelKey(p.relPath), scan.diskMap);
            if (onDisk && onDisk.size > 0) {
                p.skipCopy = onDisk.size === p.sourceSize;
            }
            if (p.sourceXmpSize > 0) {
                try {
                    const st = await fs.promises.stat(xmpSidecarPath(p.destPath));
                    p.skipCopyXmp = st.size === p.sourceXmpSize;
                } catch {
                    p.skipCopyXmp = false;
                }
            } else {
                p.skipCopyXmp = true;
            }
        }

        const currentFreeBytes = await getVolumeFreeBytes(targetPath) ?? freeBytes;
        const { droppedRelPaths } = selectPlanProportional(
            plannedWithSkip,
            currentFreeBytes,
            capacityBytes,
            {
                diversityLambda: backupConfig.diversityLambda,
                reserveFraction: backupConfig.reserveFraction,
            },
        );

        const onDiskKeys = scan.diskKeys;
        const onDiskRelPaths = new Set(
            manifest.images
                .filter((m) => onDiskKeys.has(normalizeRelKey(m.relPath)))
                .map((m) => m.relPath),
        );
        let wouldDeleteDroppedForSpace = 0;
        if (backupConfig.pruneDroppedForSpace) {
            wouldDeleteDroppedForSpace = droppedRelPaths.filter((rel) => onDiskRelPaths.has(rel)).length;
        }

        let wouldRotateOut = 0;
        if (backupConfig.rotateLowScores) {
            const desiredKeys = new Set(planBuild.planned.map((p) => normalizeRelKey(p.relPath)));
            const droppedSet = new Set(droppedRelPaths);
            const droppedItems = planBuild.planned.filter((p) => droppedSet.has(p.relPath));
            const residents = manifest.images
                .filter((entry) => entry.id !== 0
                    && !desiredKeys.has(normalizeRelKey(entry.relPath))
                    && onDiskKeys.has(normalizeRelKey(entry.relPath)))
                .map((entry) => ({ entry, size: entry.size }));
            const rotation = planRotation(
                droppedItems,
                residents,
                { scoreMargin: backupConfig.rotateScoreMargin },
            );
            wouldRotateOut = rotation.evict.length;
        }

        const staleNeedsConfirm = backupConfig.pruneStaleFiles
            && requiresStaleDeleteConfirmation(wouldDeleteFiles, manifest.images.length);
        const droppedNeedsConfirm = backupConfig.pruneDroppedForSpace
            && requiresStaleDeleteConfirmation(wouldDeleteDroppedForSpace, manifest.images.length);
        const rotateNeedsConfirm = backupConfig.rotateLowScores
            && requiresStaleDeleteConfirmation(wouldRotateOut, manifest.images.length);

        return {
            minScore: backupConfig.minScore,
            candidateCount: planBuild.allScored.length,
            plannedCount: planBuild.planned.length,
            plannedComputed: true,
            manifestCount: manifest.images.length,
            pruneStaleFiles: backupConfig.pruneStaleFiles,
            pruneDroppedForSpace: backupConfig.pruneDroppedForSpace,
            wouldDeleteFiles,
            wouldDeleteDroppedForSpace,
            prebuildProtectedCount: staleStats.prebuildProtectedCount,
            requiresConfirm: staleNeedsConfirm || droppedNeedsConfirm || rotateNeedsConfirm,
            manifestPrunedCount: staleStats.staleManifestCount,
            roughFillRatio: planBuild.roughFillRatio,
            effectiveMaxPerCluster: planBuild.maxPerCluster,
            wouldRotateOut,
        };
    }

    ipcMain.handle('backup:check-target', wrapIpcHandler(async (_, targetPath: string): Promise<BackupTargetInfo | null> => {
        if (!targetPath) return null;

        const appConfig = loadAppConfig(getConfigPath(electronDirname));
        const backupConfig = loadBackupConfig(appConfig.backup as Record<string, unknown> | undefined);
        const { freeBytes, capacityBytes } = await resolveBackupVolumeStats(targetPath);
        const usableBytes = computeUsableBytes(
            freeBytes,
            capacityBytes,
            backupConfig.reserveFraction ?? BACKUP_BUFFER_FRACTION,
        );
        const lastBackupSessionAt = await resolveLastBackupSessionAt(targetPath);

        const manifestPath = path.join(targetPath, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            return {
                exists: false,
                imageCount: 0,
                lastBackup: null,
                bytes: 0,
                freeBytes,
                capacityBytes,
                usableBytes,
                lastBackupSessionAt,
            };
        }

        try {
            const content = await fs.promises.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(content) as BackupManifest;
            return {
                exists: true,
                imageCount: manifest.images.length,
                lastBackup: manifest.updatedAt,
                bytes: manifest.images.reduce((sum: number, img: BackupManifestEntry) => sum + (img.size || 0), 0),
                freeBytes,
                capacityBytes,
                usableBytes,
                lastBackupSessionAt,
            };
        } catch (e) {
            console.error('[Main] Backup: failed to read manifest:', e);
            return null;
        }
    }));

    ipcMain.handle('backup:verify-target', wrapIpcHandler(async (_, targetPath: string): Promise<BackupVerifyReport | null> => {
        if (!targetPath) return null;
        try {
            const { manifest } = await loadBackupManifest(targetPath);
            const scan = await scanBackupDestination(targetPath);
            return reconcileManifestWithDiskReport(manifest, scan.diskKeys, {
                xmpOnlyDirs: scan.xmpOnlyDirs,
            });
        } catch (e) {
            console.error('[Main] Backup verify-target failed:', e);
            return null;
        }
    }));

    ipcMain.handle('backup:preview', wrapIpcHandler(async (_, targetPath: string): Promise<BackupPreviewInfo | null> => {
        if (!targetPath) return null;
        try {
            return await computeBackupPreview(targetPath);
        } catch (e) {
            console.error('[Main] Backup preview failed:', e);
            return null;
        }
    }));

    ipcMain.handle('backup:run', wrapIpcHandler(async (_event, arg1) => {
        const runOptions: BackupRunOptions =
            arg1 && typeof arg1 === 'object' && 'targetPath' in (arg1 as object)
                ? (arg1 as BackupRunOptions)
                : { targetPath: arg1 as string };

        const targetPath = runOptions.targetPath;
        const confirmMassDelete = runOptions.confirmMassDelete === true;

        if (!targetPath || typeof targetPath !== 'string') {
            throw new Error('Backup target path is required');
        }

        if (getIsBackupRunning()) {
            throw new Error('Another backup is already in progress.');
        }
        if (syncGuards.isSyncRunInProgress() || syncGuards.activeSyncPreviewCount() > 0) {
            throw new Error('A sync operation is in progress. Finish sync before running backup.');
        }

        setIsBackupRunning(true);
        rebuildApplicationMenu();

        const sendProgress = (progress: BackupProgress) => {
            mainWindow?.webContents.send('backup:progress', progress);
        };

        const emptyResult = (errors: string[] = [], warnings: string[] = []): BackupResult => ({
            copied: 0,
            skipped: 0,
            deduplicated: 0,
            errors,
            staleRemoved: 0,
            manifestPruned: 0,
            prebuildProtected: 0,
            droppedForSpace: 0,
            warnings: warnings.length > 0 ? warnings : undefined,
            reconcileDroppedMissing: 0,
            reconcileAdopted: 0,
            rotatedOut: 0,
            rejectReasons: undefined,
            emptyDirsPruned: 0,
        });

        try {
            const appConfig = loadAppConfig(getConfigPath(electronDirname));
            const backupConfig = loadBackupConfig(
                appConfig.backup as Record<string, unknown> | undefined,
            );
            const { manifest, manifestPath } = await loadBackupManifest(targetPath);

            sendProgress({
                phase: 'scanning',
                current: 0,
                total: 0,
                detail: 'Scanning destination...',
            });

            const scan = await scanBackupDestination(targetPath);
            const preReconcileReport = reconcileManifestWithDiskReport(manifest, scan.diskKeys, {
                xmpOnlyDirs: scan.xmpOnlyDirs,
            });
            const reconcileResult = reconcileManifestWithDisk(manifest, scan.diskMap);
            let manifestIndexByKey = buildManifestIndex(manifest);
            let manifestDirty = reconcileResult.adopted > 0 || reconcileResult.droppedMissing > 0;
            let firstManifestWrite = true;

            const persistManifest = async () => {
                manifest.updatedAt = new Date().toISOString();
                const rotateBak = firstManifestWrite;
                firstManifestWrite = false;
                await writeManifestAtomic(manifestPath, manifest, rotateBak);
                manifestDirty = false;
            };

            if (manifestDirty) {
                await persistManifest();
            }

            sendProgress({
                phase: 'scanning',
                current: 0,
                total: 0,
                detail: `Querying scored images (min score ${backupConfig.minScore})...`,
            });

            const { freeBytes, capacityBytes } = await resolveBackupVolumeStats(targetPath);

            let planBuild;
            try {
                planBuild = await buildBackupPlan({
                    targetPath,
                    backupConfig,
                    freeBytes,
                    capacityBytes,
                    normalizeCameraModel,
                    normalizeLensFolderName,
                    isUnresolvedSyncLayout,
                    toWindowsLocalFsPath,
                    presentRelPaths: scan.diskKeys,
                    onDedupProgress: (current, total, detail) =>
                        sendProgress({ phase: 'deduplicating', current, total, detail }),
                });
            } catch (e) {
                console.error('[Main] Backup: failed to build plan:', e);
                return emptyResult([String(e)]);
            }

            const warnings = [...planBuild.warnings];
            if (planBuild.allScored.length === 0) {
                sendProgress({ phase: 'done', current: 0, total: 0, detail: 'No scored images found' });
                return {
                    ...emptyResult([], warnings),
                    reconcileAdopted: reconcileResult.adopted,
                    reconcileDroppedMissing: reconcileResult.droppedMissing,
                    rejectReasons: planBuild.rejectReasons,
                };
            }

            sendProgress({
                phase: 'calculating',
                current: 0,
                total: Math.max(1, planBuild.planned.length),
                detail: `Preparing ${planBuild.planned.length} files (layout + disk budget)...`,
            });

            const planned = planBuild.planned;
            const errors: string[] = [];
            let skipped = planBuild.skippedLayout;

            const desiredRelPaths = new Set(planned.map((p) => p.relPath));
            const desiredRelKeys = new Set(planned.map((p) => normalizeRelKey(p.relPath)));

            const stalePreview = analyzeStaleManifestEntries(manifest, desiredRelPaths, {
                allowPrebuildDelete: backupConfig.pruneStaleFiles && confirmMassDelete,
            });
            const wouldDeleteFiles = backupConfig.pruneStaleFiles ? stalePreview.wouldDeleteFiles : 0;

            for (const p of planned) {
                const key = normalizeRelKey(p.relPath);
                const onDisk = diskEntryForKey(key, scan.diskMap);

                if (onDisk) {
                    if (onDisk.size > 0) {
                        p.skipCopy = onDisk.size === p.sourceSize;
                    } else {
                        p.skipCopy = true;
                    }

                    const existingIdx = manifestIndexByKey.get(key);
                    const item: BackupManifestEntry = {
                        id: existingIdx !== undefined ? manifest.images[existingIdx].id : p.img.id,
                        relPath: onDisk.relPath,
                        score: p.score,
                        size: onDisk.size > 0 ? onDisk.size : p.sourceSize,
                        hash: p.img.image_hash || '',
                    };
                    if (existingIdx !== undefined) {
                        manifest.images[existingIdx] = item;
                    } else {
                        manifestIndexByKey.set(key, manifest.images.length);
                        manifest.images.push(item);
                    }
                    manifestDirty = true;
                } else {
                    p.skipCopy = false;
                }

                if (p.sourceXmpSize > 0) {
                    const destXmp = xmpSidecarPath(p.destPath);
                    try {
                        const st = await fs.promises.stat(destXmp);
                        p.skipCopyXmp = st.size === p.sourceXmpSize;
                    } catch {
                        p.skipCopyXmp = false;
                    }
                } else {
                    p.skipCopyXmp = true;
                }
            }

            const currentFreeBytes = await getVolumeFreeBytes(targetPath) ?? freeBytes;

            const { selected: selectedPlan, droppedRelPaths } = selectPlanProportional(
                planned,
                currentFreeBytes,
                capacityBytes,
                {
                    diversityLambda: backupConfig.diversityLambda,
                    reserveFraction: backupConfig.reserveFraction,
                },
            );

            let finalPlan = selectedPlan;
            const droppedSet = new Set(droppedRelPaths);
            const droppedItems = planned.filter((p) => droppedSet.has(p.relPath));

            const onDiskRelPaths = new Set(
                manifest.images
                    .filter((m) => scan.diskKeys.has(normalizeRelKey(m.relPath)))
                    .map((m) => m.relPath),
            );
            const droppedOnDisk = backupConfig.pruneDroppedForSpace
                ? droppedRelPaths.filter((rel) => onDiskRelPaths.has(rel))
                : [];

            let wouldRotateOut = 0;
            let rotationEvict: ReturnType<typeof planRotation>['evict'] = [];
            let rotationAdmit: ReturnType<typeof planRotation>['admit'] = [];

            if (backupConfig.rotateLowScores) {
                if (reconcileHasSignificantDrift(preReconcileReport)) {
                    throw new Error(
                        'Backup rotation refused: manifest drift from disk is too large. '
                        + 'Use Verify destination, run a reconcile pass (normal backup), then retry with rotateLowScores.',
                    );
                }

                const residents = manifest.images
                    .filter((entry) => entry.id !== 0
                        && !desiredRelKeys.has(normalizeRelKey(entry.relPath))
                        && scan.diskKeys.has(normalizeRelKey(entry.relPath)))
                    .map((entry) => ({ entry, size: entry.size }));

                const rotation = planRotation(
                    droppedItems,
                    residents,
                    { scoreMargin: backupConfig.rotateScoreMargin },
                );
                rotationEvict = rotation.evict;
                rotationAdmit = rotation.admit;
                wouldRotateOut = rotation.evict.length;
            }

            if (
                backupConfig.pruneStaleFiles
                && requiresStaleDeleteConfirmation(wouldDeleteFiles, manifest.images.length)
                && !confirmMassDelete
            ) {
                throw new Error(
                    `Backup would permanently delete ${wouldDeleteFiles} files from the destination. `
                    + 'Re-run with confirmation or set backup.pruneStaleFiles to false in config.json.',
                );
            }
            if (
                backupConfig.pruneDroppedForSpace
                && requiresStaleDeleteConfirmation(droppedOnDisk.length, manifest.images.length)
                && !confirmMassDelete
            ) {
                throw new Error(
                    `Backup would permanently delete ${droppedOnDisk.length} existing destination files `
                    + 'dropped for insufficient disk space. Re-run with confirmation or set '
                    + 'backup.pruneDroppedForSpace to false in config.json.',
                );
            }
            if (
                backupConfig.rotateLowScores
                && requiresStaleDeleteConfirmation(wouldRotateOut, manifest.images.length)
                && !confirmMassDelete
            ) {
                throw new Error(
                    `Backup would permanently rotate out ${wouldRotateOut} lower-scoring resident files. `
                    + 'Re-run with confirmation or set backup.rotateLowScores to false in config.json.',
                );
            }

            const removedRelPaths: string[] = [];

            const { manifestPruned, filesRemoved, prebuildProtectedCount } = await syncStaleBackupEntries(
                targetPath,
                manifest,
                desiredRelPaths,
                backupConfig.pruneStaleFiles,
                confirmMassDelete,
            );
            if (filesRemoved > 0) {
                for (const entry of stalePreview.staleEntries) {
                    if (backupConfig.pruneStaleFiles && (confirmMassDelete || entry.id !== 0)) {
                        removedRelPaths.push(entry.relPath);
                    }
                }
            }
            if (manifestPruned > 0 || filesRemoved > 0) manifestDirty = true;
            manifestIndexByKey = buildManifestIndex(manifest);

            const droppedForSpace = droppedRelPaths.length;
            if (backupConfig.pruneDroppedForSpace) {
                for (const rel of droppedOnDisk) {
                    const abs = path.join(targetPath, rel);
                    await fs.promises.unlink(abs).catch(() => {});
                    await fs.promises.unlink(xmpSidecarPath(abs)).catch(() => {});
                    manifest.images = manifest.images.filter((m: BackupManifestEntry) => m.relPath !== rel);
                    removedRelPaths.push(rel);
                }
                if (droppedOnDisk.length > 0) manifestDirty = true;
            }
            manifestIndexByKey = buildManifestIndex(manifest);

            let rotatedOut = 0;
            if (backupConfig.rotateLowScores && rotationEvict.length > 0) {
                for (const res of rotationEvict) {
                    const abs = path.join(targetPath, res.entry.relPath);
                    await fs.promises.unlink(abs).catch(() => {});
                    await fs.promises.unlink(xmpSidecarPath(abs)).catch(() => {});
                    removedRelPaths.push(res.entry.relPath);
                    const key = normalizeRelKey(res.entry.relPath);
                    const idx = manifestIndexByKey.get(key);
                    if (idx !== undefined) {
                        manifest.images.splice(idx, 1);
                        manifestIndexByKey = buildManifestIndex(manifest);
                    } else {
                        manifest.images = manifest.images.filter(
                            (m) => normalizeRelKey(m.relPath) !== key,
                        );
                    }
                    rotatedOut++;
                }
                manifestDirty = true;
            }

            if (backupConfig.rotateLowScores && rotationAdmit.length > 0) {
                const finalKeys = new Set(finalPlan.map((p) => normalizeRelKey(p.relPath)));
                for (const admit of rotationAdmit) {
                    const key = normalizeRelKey(admit.relPath);
                    if (!finalKeys.has(key)) {
                        finalPlan.push(admit);
                        finalKeys.add(key);
                    }
                }
            }

            const emptyDirsPruned = removedRelPaths.length > 0
                ? await pruneEmptyDirs(targetPath, removedRelPaths)
                : 0;

            sendProgress({ phase: 'copying', current: 0, total: finalPlan.length, detail: 'Starting file transfer...' });

            let copied = 0;
            let copiesSinceCheckpoint = 0;

            try {
                for (let i = 0; i < finalPlan.length; i++) {
                    const p = finalPlan[i];
                    const { img, fileName, relPath, destPath } = p;
                    const relDir = path.dirname(relPath);
                    const relKey = normalizeRelKey(relPath);

                    sendProgress({ phase: 'copying', current: i + 1, total: finalPlan.length, detail: fileName });

                    if (p.skipCopy && p.skipCopyXmp) {
                        skipped++;
                        continue;
                    }

                    try {
                        await fs.promises.mkdir(path.join(targetPath, relDir), { recursive: true });

                        if (!p.skipCopy) {
                            const stats = await fs.promises.stat(p.sourcePath);
                            await fs.promises.copyFile(p.sourcePath, destPath);

                            const item: BackupManifestEntry = {
                                id: img.id,
                                relPath,
                                score: img.composite_score || 0,
                                size: stats.size,
                                hash: img.image_hash || '',
                            };
                            const manifestIdx = manifestIndexByKey.get(relKey);
                            if (manifestIdx !== undefined) {
                                manifest.images[manifestIdx] = item;
                            } else {
                                manifestIndexByKey.set(relKey, manifest.images.length);
                                manifest.images.push(item);
                            }

                            copied++;
                        } else {
                            skipped++;
                        }

                        if (p.sourceXmpSize > 0 && !p.skipCopyXmp) {
                            const srcXmp = xmpSidecarPath(p.sourcePath);
                            const dstXmp = xmpSidecarPath(destPath);
                            await fs.promises.copyFile(srcXmp, dstXmp).catch((e) => {
                                console.warn(`[Backup] Could not copy sidecar ${srcXmp}: ${e}`);
                            });
                        }

                        if (p.sourceXmpSize === 0) {
                            await fs.promises.unlink(xmpSidecarPath(destPath)).catch(() => {});
                        }

                        manifestDirty = true;
                        copiesSinceCheckpoint++;
                        if (copiesSinceCheckpoint >= MANIFEST_CHECKPOINT_INTERVAL) {
                            sendProgress({
                                phase: 'cleaning',
                                current: copied,
                                total: finalPlan.length,
                                detail: 'Checkpointing manifest...',
                            });
                            await persistManifest();
                            copiesSinceCheckpoint = 0;
                        }
                    } catch (e) {
                        errors.push(`${fileName}: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            } finally {
                if (manifestDirty) {
                    sendProgress({ phase: 'cleaning', current: 1, total: 1, detail: 'Writing manifest...' });
                    await persistManifest();
                }
            }

            try {
                const identity = await resolveDriveId(targetPath);
                const store = getDriveSessionStore(app.getPath('userData'));
                const existing = await store.read(identity.driveId);
                await store.write({
                    driveId: identity.driveId,
                    label: existing?.label,
                    updatedAt: new Date().toISOString(),
                    sync: existing?.sync,
                    backup: {
                        lastTargetRoot: targetPath,
                        lastBackupAt: new Date().toISOString(),
                    },
                });
            } catch (e) {
                console.warn('[Backup] Could not update drive session:', e);
            }

            const rejectReasons: Partial<Record<BackupRejectReason, number>> = {
                ...planBuild.rejectReasons,
            };
            if (droppedForSpace > 0) {
                rejectReasons.space = (rejectReasons.space ?? 0) + droppedForSpace;
            }

            const detailParts = [`Backup complete: ${copied} copied, ${skipped} skipped.`];
            if (reconcileResult.adopted > 0) {
                detailParts.push(`${reconcileResult.adopted} orphan(s) adopted into manifest.`);
            }
            if (reconcileResult.droppedMissing > 0) {
                detailParts.push(`${reconcileResult.droppedMissing} phantom manifest row(s) dropped.`);
            }
            if (manifestPruned > 0) detailParts.push(`${manifestPruned} manifest entries updated.`);
            if (filesRemoved > 0) detailParts.push(`${filesRemoved} files deleted (mirror prune).`);
            if (prebuildProtectedCount > 0) {
                detailParts.push(`${prebuildProtectedCount} prebuild files kept on disk.`);
            }
            if (rotatedOut > 0) {
                detailParts.push(`${rotatedOut} lower-scoring file(s) rotated out.`);
            }
            if (emptyDirsPruned > 0) {
                detailParts.push(`${emptyDirsPruned} empty director(ies) pruned.`);
            }
            if (droppedForSpace > 0) {
                detailParts.push(
                    backupConfig.pruneDroppedForSpace
                        ? `${droppedForSpace} dropped for insufficient space (deleted from destination).`
                        : `${droppedForSpace} not copied (insufficient space; existing files kept).`,
                );
            }
            sendProgress({
                phase: 'done',
                current: finalPlan.length,
                total: Math.max(1, finalPlan.length),
                detail: detailParts.join(' '),
            });

            return {
                copied,
                skipped,
                deduplicated: planBuild.rejectedCount,
                errors,
                staleRemoved: filesRemoved,
                manifestPruned,
                prebuildProtected: prebuildProtectedCount,
                droppedForSpace,
                warnings: warnings.length > 0 ? warnings : undefined,
                reconcileDroppedMissing: reconcileResult.droppedMissing,
                reconcileAdopted: reconcileResult.adopted,
                rotatedOut,
                rejectReasons,
                emptyDirsPruned,
            };
        } finally {
            setIsBackupRunning(false);
            rebuildApplicationMenu();
        }
    }));
}

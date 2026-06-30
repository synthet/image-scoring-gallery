import fs from 'fs';
import path from 'path';
import type { BrowserWindow, IpcMain } from 'electron';
import { getConfigPath, loadAppConfig } from '../config';
import { buildBackupPlan } from '../backupPipeline';
import { loadBackupConfig, requiresStaleDeleteConfirmation } from '../backupConfig';
import {
  analyzeStaleManifestEntries,
  getVolumeCapacityBytes,
  getVolumeFreeBytes,
  selectPlanProportional,
  syncStaleBackupEntries,
  xmpSidecarPath,
} from '../backupSpace';
import { toWindowsLocalFsPath } from '../pathWinWsl';
import { normalizeLensFolderName } from '../lensFolderName';
import type {
  BackupManifest,
  BackupManifestEntry,
  BackupPreviewInfo,
  BackupProgress,
  BackupResult,
  BackupRunOptions,
  BackupTargetInfo,
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
       * Atomically persist the manifest: write to a temp file, fsync, rotate the previous
       * manifest to `.bak`, then rename into place. The manifest is the only record of what is
       * backed up; a crash mid-write must never corrupt or truncate it.
       */
      async function writeManifestAtomic(manifestPath: string, manifest: BackupManifest): Promise<void> {
          const tmpPath = `${manifestPath}.tmp`;
          const data = JSON.stringify(manifest, null, 2);
          const handle = await fs.promises.open(tmpPath, 'w');
          try {
              await handle.writeFile(data, 'utf-8');
              await handle.sync();
          } finally {
              await handle.close();
          }
          // Rotate the existing manifest to .bak before replacing it (best-effort).
          if (fs.existsSync(manifestPath)) {
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


      async function computeBackupPreview(targetPath: string): Promise<BackupPreviewInfo> {
          const appConfig = loadAppConfig(getConfigPath(electronDirname));
          const backupConfig = loadBackupConfig(appConfig.backup as Record<string, unknown> | undefined);
          const { manifest } = await loadBackupManifest(targetPath);
          const { freeBytes, capacityBytes } = await resolveBackupVolumeStats(targetPath);

          // Fast path: with additive defaults (no pruning) the pre-flight needs no deletion
          // accounting, so skip the expensive embedding-dedup plan build entirely. The exact
          // selection is computed during the run, which reports progress. This keeps the modal
          // responsive instead of blocking on a full pgvector dedup pass.
          if (!backupConfig.pruneStaleFiles && !backupConfig.pruneDroppedForSpace) {
              return {
                  minScore: backupConfig.minScore,
                  candidateCount: await db.countScoredImagesForBackup(backupConfig.minScore),
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
              };
          }

          const planBuild = await buildBackupPlan({
              targetPath,
              backupConfig,
              freeBytes,
              capacityBytes,
              normalizeCameraModel,
              normalizeLensFolderName,
              isUnresolvedSyncLayout,
              toWindowsLocalFsPath,
          });

          const desiredRelPaths = new Set(planBuild.planned.map((p) => p.relPath));
          const staleStats = analyzeStaleManifestEntries(manifest, desiredRelPaths, {
              allowPrebuildDelete: false,
          });
          const wouldDeleteFiles = backupConfig.pruneStaleFiles ? staleStats.wouldDeleteFiles : 0;

          // Estimate destination copies that would be deleted for insufficient space.
          // Only copies already present on disk (in the manifest) can actually be deleted.
          let wouldDeleteDroppedForSpace = 0;
          if (backupConfig.pruneDroppedForSpace) {
              const currentFreeBytes = await getVolumeFreeBytes(targetPath) ?? freeBytes;
              const { droppedRelPaths } = selectPlanProportional(
                  planBuild.planned,
                  currentFreeBytes,
                  capacityBytes,
                  { diversityLambda: backupConfig.diversityLambda },
              );
              const onDisk = new Set(manifest.images.map((m) => m.relPath));
              wouldDeleteDroppedForSpace = droppedRelPaths.filter((rel) => onDisk.has(rel)).length;
          }

          const staleNeedsConfirm = backupConfig.pruneStaleFiles
              && requiresStaleDeleteConfirmation(wouldDeleteFiles, manifest.images.length);
          const droppedNeedsConfirm = backupConfig.pruneDroppedForSpace
              && requiresStaleDeleteConfirmation(wouldDeleteDroppedForSpace, manifest.images.length);

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
              requiresConfirm: staleNeedsConfirm || droppedNeedsConfirm,
              manifestPrunedCount: staleStats.staleManifestCount,
          };
      }

      ipcMain.handle('backup:check-target', wrapIpcHandler(async (_, targetPath: string): Promise<BackupTargetInfo | null> => {
          if (!targetPath) return null;
          const manifestPath = path.join(targetPath, 'manifest.json');
          if (!fs.existsSync(manifestPath)) {
              return { exists: false, imageCount: 0, lastBackup: null, bytes: 0 };
          }
          try {
              const content = await fs.promises.readFile(manifestPath, 'utf8');
              const manifest = JSON.parse(content) as BackupManifest;
              return {
                  exists: true,
                  imageCount: manifest.images.length,
                  lastBackup: manifest.updatedAt,
                  bytes: manifest.images.reduce((sum: number, img: BackupManifestEntry) => sum + (img.size || 0), 0)
              };
          } catch (e) {
              console.error('[Main] Backup: failed to read manifest:', e);
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
                  return emptyResult([], warnings);
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
              const stalePreview = analyzeStaleManifestEntries(manifest, desiredRelPaths, {
                  allowPrebuildDelete: backupConfig.pruneStaleFiles && confirmMassDelete,
              });
              const wouldDeleteFiles = backupConfig.pruneStaleFiles ? stalePreview.wouldDeleteFiles : 0;

              // Resolve skip-copy flags first — selectPlanProportional needs them for accurate
              // space budgeting (skip-copy items already on disk don't consume the free-space budget).
              for (const p of planned) {
                  const manifestEntry = manifest.images.find((m: BackupManifestEntry) => m.relPath === p.relPath);
                  if (fs.existsSync(p.destPath) && manifestEntry) {
                      if (manifestEntry.size > 0) {
                          try {
                              const st = await fs.promises.stat(p.destPath);
                              p.skipCopy = st.size === manifestEntry.size;
                          } catch {
                              p.skipCopy = false;
                          }
                      } else {
                          p.skipCopy = true;
                      }
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
                  }
              }

              const currentFreeBytes = await getVolumeFreeBytes(targetPath) ?? freeBytes;

              const { selected: finalPlan, droppedRelPaths } = selectPlanProportional(
                  planned,
                  currentFreeBytes,
                  capacityBytes,
                  { diversityLambda: backupConfig.diversityLambda },
              );

              // Destination copies dropped for space that already exist on disk are the only
              // files a space-prune can actually delete.
              const onDiskRelPaths = new Set(manifest.images.map((m: BackupManifestEntry) => m.relPath));
              const droppedOnDisk = backupConfig.pruneDroppedForSpace
                  ? droppedRelPaths.filter((rel) => onDiskRelPaths.has(rel))
                  : [];

              // ---- Confirmation gates: evaluate ALL destructive actions before deleting anything ----
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

              const { manifestPruned, filesRemoved, prebuildProtectedCount } = await syncStaleBackupEntries(
                  targetPath,
                  manifest,
                  desiredRelPaths,
                  backupConfig.pruneStaleFiles,
                  confirmMassDelete,
              );

              const droppedForSpace = droppedRelPaths.length;
              if (backupConfig.pruneDroppedForSpace) {
                  for (const rel of droppedOnDisk) {
                      const abs = path.join(targetPath, rel);
                      await fs.promises.unlink(abs).catch(() => {});
                      await fs.promises.unlink(xmpSidecarPath(abs)).catch(() => {});
                      manifest.images = manifest.images.filter((m: BackupManifestEntry) => m.relPath !== rel);
                  }
              }

              sendProgress({ phase: 'copying', current: 0, total: finalPlan.length, detail: 'Starting file transfer...' });

              let copied = 0;

              for (let i = 0; i < finalPlan.length; i++) {
                  const p = finalPlan[i];
                  const { img, fileName, relPath, destPath } = p;
                  const relDir = path.dirname(relPath);

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

                          const manifestIdx = manifest.images.findIndex((m: BackupManifestEntry) => m.relPath === relPath);
                          const item: BackupManifestEntry = {
                              id: img.id,
                              relPath,
                              score: img.composite_score || 0,
                              size: stats.size,
                              hash: img.image_hash || '',
                          };
                          if (manifestIdx >= 0) manifest.images[manifestIdx] = item;
                          else manifest.images.push(item);

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
                  } catch (e) {
                      errors.push(`${fileName}: ${e instanceof Error ? e.message : String(e)}`);
                  }
              }

              sendProgress({ phase: 'cleaning', current: 1, total: 1, detail: 'Writing manifest...' });
              manifest.updatedAt = new Date().toISOString();
              await writeManifestAtomic(manifestPath, manifest);

              const detailParts = [`Backup complete: ${copied} copied, ${skipped} skipped.`];
              if (manifestPruned > 0) detailParts.push(`${manifestPruned} manifest entries updated.`);
              if (filesRemoved > 0) detailParts.push(`${filesRemoved} files deleted (mirror prune).`);
              if (prebuildProtectedCount > 0) {
                  detailParts.push(`${prebuildProtectedCount} prebuild files kept on disk.`);
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
              };
          } finally {
              setIsBackupRunning(false);
              rebuildApplicationMenu();
          }
      }));
}

import fs from 'fs';
import path from 'path';
import type { BrowserWindow, IpcMain } from 'electron';
import type { ApiService } from '../apiService';
import { ExifTool } from 'exiftool-vendored';
import { cameraFolderFromExifModel } from '../cameraFolderName';
import { normalizeLensFolderName } from '../lensFolderName';

const UNKNOWN_CAMERA_FOLDER = '_unknown_camera';
import type {
  SyncCandidate,
  SyncPreviewResult,
  SyncRunResult,
} from '../types';
import * as db from '../db';
import { wrapIpcHandler } from './wrapIpcHandler';
import { assertSyncPreviewAllowed, assertSyncRunAllowed, type SyncGuards } from '../main.handlers';
import type { AppConfig } from '../types';
import {
  scheduleProcessingForImages,
  type ScheduleResult,
} from '../scheduleProcessing';

export type SyncHandlersDeps = {
  ipcMain: IpcMain;
  exiftool: ExifTool;
  apiService: ApiService;
  loadConfig: () => AppConfig;
  getMainWindow: () => BrowserWindow | null;
  syncGuards: SyncGuards;
  rebuildApplicationMenu: () => void;
  isUnresolvedSyncLayout: (camera: string, lens: string) => boolean;
};

export function registerSyncHandlers(deps: SyncHandlersDeps): void {
  const {
    ipcMain,
    exiftool,
    apiService,
    loadConfig,
    getMainWindow,
    syncGuards,
    rebuildApplicationMenu,
    isUnresolvedSyncLayout,
  } = deps;
  const mainWindow = getMainWindow();

      /** Maps EXIF Model to a folder segment; uses shared rules in `cameraFolderName.ts` (Python: `camera_folder_name`). */
      function normalizeCameraModel(raw: string | undefined | null): string {
          const seg = cameraFolderFromExifModel(raw ?? undefined);
          return seg === 'unknown' ? UNKNOWN_CAMERA_FOLDER : seg;
      }

      /** Recursively collect Nikon RAW (.nef) files from a directory for sync. */
      const SYNC_EXTENSIONS = new Set(['.nef']);

      async function collectImageFiles(dir: string): Promise<string[]> {
          const result: string[] = [];
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                  const sub = await collectImageFiles(fullPath);
                  result.push(...sub);
              } else if (entry.isFile() && SYNC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                  result.push(fullPath);
              }
          }
          return result;
      }

      const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

      function maxIsoDate(a: string | null, b: string | null): string | null {
          if (!a && !b) return null;
          if (!a) return b;
          if (!b) return a;
          return a >= b ? a : b;
      }

      /**
       * Detect the threshold date for sync: photos on or before this date are
       * presumed already synced and can be bypassed by an EXIF quick-skip check.
       *
       * Heuristics (combined, then 1-day safety margin):
       * 1. Walk destRoot for leaf folders named YYYY-MM-DD (sync layout).
       * 2. Max shoot date from indexed rows: COALESCE(image_exif.date_time_original, create_date).
       * 3. If (1) and (2) both missing, fall back to MAX(images.created_at)::date (import time).
       *
       * The highest YYYY-MM-DD among (1) and (2) is the watermark; (3) only if both absent.
       * Margin subtracts one day so the last sync day is always re-checked (EXIF vs threshold).
       */
      async function detectSyncThresholdDate(destRoot: string): Promise<string | null> {
          let latestDateFolder: string | null = null;

          try {
              const datePattern = /^\d{4}-\d{2}-\d{2}$/;
              const cameraDirs = await fs.promises.readdir(destRoot, { withFileTypes: true }).catch(() => []);
              for (const cam of cameraDirs) {
                  if (!cam.isDirectory()) continue;
                  const lensDirs = await fs.promises.readdir(path.join(destRoot, cam.name), { withFileTypes: true }).catch(() => []);
                  for (const lens of lensDirs) {
                      if (!lens.isDirectory()) continue;
                      const yearDirs = await fs.promises.readdir(path.join(destRoot, cam.name, lens.name), { withFileTypes: true }).catch(() => []);
                      for (const yr of yearDirs) {
                          if (!yr.isDirectory()) continue;
                          const dateDirs = await fs.promises.readdir(path.join(destRoot, cam.name, lens.name, yr.name), { withFileTypes: true }).catch(() => []);
                          for (const dd of dateDirs) {
                              if (dd.isDirectory() && datePattern.test(dd.name)) {
                                  if (!latestDateFolder || dd.name > latestDateFolder) {
                                      latestDateFolder = dd.name;
                                  }
                              }
                          }
                      }
                  }
              }
          } catch {
              // destRoot may not exist yet — that's fine
          }

          let dbMaxCapture: string | null = null;
          let dbMaxCreated: string | null = null;
          try {
              [dbMaxCapture, dbMaxCreated] = await Promise.all([
                  db.getMaxIndexedCaptureDateUnderDestRoot(destRoot),
                  db.getMaxIndexedCreatedDateUnderDestRoot(destRoot),
              ]);
          } catch (e) {
              console.warn('[Sync] DB threshold queries failed:', e);
          }

          let watermark: string | null = maxIsoDate(
              latestDateFolder && ISO_DATE.test(latestDateFolder) ? latestDateFolder : null,
              dbMaxCapture && ISO_DATE.test(dbMaxCapture) ? dbMaxCapture : null
          );

          if (!watermark) {
              watermark = dbMaxCreated && ISO_DATE.test(dbMaxCreated) ? dbMaxCreated : null;
          }

          if (!watermark) {
              console.log('[Sync] No threshold detected — will process all files');
              return null;
          }

          const d = new Date(watermark + 'T00:00:00');
          d.setDate(d.getDate() - 1);
          const margin = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const usedCreatedFallback =
              watermark === dbMaxCreated &&
              !maxIsoDate(
                  latestDateFolder && ISO_DATE.test(latestDateFolder) ? latestDateFolder : null,
                  dbMaxCapture && ISO_DATE.test(dbMaxCapture) ? dbMaxCapture : null
              );
          console.log(
              `[Sync] Watermark ${watermark} (folder=${latestDateFolder ?? '—'} exif_max=${dbMaxCapture ?? '—'} created_max=${dbMaxCreated ?? '—'}${usedCreatedFallback ? ' [used created_at fallback]' : ''}) → skip ≤ ${margin} (1-day margin)`
          );
          return margin;
      }

      /** Relative path under dest root with forward slashes for UI. */
      function syncRelDisplay(destRoot: string, absolute: string): string {
          return path.relative(destRoot, absolute).split(path.sep).join('/');
      }

      /**
       * Core sync: threshold, scan, EXIF/DB per file, copy (+ import when not dryRun).
       * Preview (dryRun) uses the same EXIF/DB passes without mkdir/copy/import; a follow-up full sync
       * repeats copy/EXIF for source files (phase 1). Import (phase 2) only touches destination paths
       * recorded during phase 1 as pending DB rows — no second full-folder scan.
       */
      type SyncFromSourceResult =
          | (SyncPreviewResult & { dryRun: true })
          | (SyncRunResult & { dryRun: false });

      async function runSyncFromSource(
          sourcePath: string,
          dryRun: boolean,
          pickedCandidates?: SyncCandidate[]
      ): Promise<SyncFromSourceResult> {
          const currentConfig = loadConfig();
          const destRoot = (currentConfig?.sync?.destinationRoot || 'D:\\Photos').replace(/\//g, '\\');
          if (!dryRun) {
              console.log(
                  `[Main] Sync: source=${sourcePath}, dest=${destRoot}, pickedCount=${pickedCandidates?.length ?? 'all'}`
              );
          }

          mainWindow?.webContents.send('sync:progress', {
              phase: 'detecting',
              current: 0,
              total: 0,
              detail: 'Detecting last sync date...',
          });

          const thresholdDate = await detectSyncThresholdDate(destRoot);

          let allFiles: string[];
          if (pickedCandidates) {
              allFiles = pickedCandidates.map((c) => c.sourcePath);
          } else {
              mainWindow?.webContents.send('sync:progress', {
                  phase: 'scanning',
                  current: 0,
                  total: 0,
                  detail: thresholdDate
                      ? `Scanning source (skipping files on or before ${thresholdDate})...`
                      : 'Scanning source for images...',
              });
              allFiles = await collectImageFiles(sourcePath);
          }
          const totalScanned = allFiles.length;

          if (allFiles.length === 0) {
              mainWindow?.webContents.send('sync:progress', {
                  phase: 'done', current: 0, total: 0,
                  detail: dryRun ? 'Preview complete (nothing to process)' : 'Sync complete (nothing to copy)'
              });
              if (dryRun) {
                  return {
                      dryRun: true,
                      thresholdDate,
                      destinationRoot: destRoot,
                      scanned: totalScanned,
                      skipped: 0,
                      wouldCopy: 0,
                      importOnly: 0,
                      newFolders: [],
                      errors: [],
                      candidates: [],
                  };
              }
              return {
                  dryRun: false,
                  scanned: totalScanned, copied: 0, imported: 0,
                  skipped: 0, folders: 0, errors: [],
                  thresholdDate,
                  processing: [],
              };
          }

          mainWindow?.webContents.send('sync:progress', {
              phase: 'scanning', current: totalScanned, total: totalScanned,
              detail: `Found ${totalScanned} image files`
          });

          const totalCandidates = allFiles.length;
          let copied = 0;
          let wouldCopy = 0;
          let importOnly = 0;
          let skippedCount = 0;
          const errors: string[] = [];
          /** Full sync only: dest file paths that still need `insertImage` after copy (dedup by path). */
          const pendingImports = new Map<string, { imageUuid: string | null }>();
          const newFolderRelPaths = new Set<string>();
          const candidates: SyncCandidate[] = [];

          // Preload deleted_images tombstones once so previously-deleted files are not
          // re-imported by Sync (matches by image_uuid+file_name or original_path).
          const deletedKeys = await db.getDeletedImageKeys();

          const processPhase = dryRun ? 'preview' : 'copying';
          let processedCount = 0;
          const concurrencyLimit = 15; // Safe parallelism for exiftool + DB queries

          for (let batchStart = 0; batchStart < allFiles.length; batchStart += concurrencyLimit) {
              const batch = allFiles.slice(batchStart, batchStart + concurrencyLimit);

              await Promise.all(batch.map(async (filePath, idxInBatch) => {
                  const absIdx = batchStart + idxInBatch;
                  const fileName = path.basename(filePath);

                  try {
                      let dateStr: string | null = null;
                      let cameraModel: string | null = null;
                      let lensModel: string | null = null;
                      let imageUuid: string | null = null;
                      let camera = '';
                      let lens = '';

                      if (pickedCandidates) {
                          const c = pickedCandidates[absIdx];
                          dateStr = c.dateStr;
                          camera = c.camera;
                          lens = c.lens;
                          imageUuid = c.imageUuid;
                      } else {
                          try {
                              const tags = await exiftool.read(filePath);

                              const dto = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
                              if (dto) {
                                  const raw = typeof dto === 'string' ? dto : String(dto);
                                  const match = raw.match(/(\d{4})[:-](\d{2})[:-](\d{2})/);
                                  if (match) {
                                      dateStr = `${match[1]}-${match[2]}-${match[3]}`;
                                  }
                              }

                              cameraModel = (tags.Model as string) ?? null;
                              lensModel = (tags.LensModel as string) ?? (tags.Lens as string) ?? null;

                              const uid = tags.ImageUniqueID ?? tags.DocumentID ?? null;
                              if (uid && typeof uid === 'string') {
                                  imageUuid = uid;
                              }
                          } catch {
                              // EXIF read failed; use file date fallback
                          }

                          if (!dateStr) {
                              const fstat = await fs.promises.stat(filePath);
                              const d = fstat.mtime;
                              dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                          }

                          camera = normalizeCameraModel(cameraModel);
                          lens = normalizeLensFolderName(lensModel);

                          if (isUnresolvedSyncLayout(camera, lens)) {
                              console.warn(
                                  `[Sync] Skip (missing camera/lens for layout): ${filePath} exif_model=${cameraModel ?? '—'} exif_lens=${lensModel ?? '—'}`
                              );
                              skippedCount++;
                              return;
                          }

                          if (thresholdDate && dateStr <= thresholdDate) {
                              if (imageUuid) {
                                  const existsByUuid = await db.findImageByUuid(imageUuid);
                                  if (existsByUuid) {
                                      skippedCount++;
                                      return;
                                  }
                              }
                              const year = dateStr.substring(0, 4);
                              const destFileEarly = path.join(destRoot, camera, lens, year, dateStr, fileName);
                              if (await fs.promises.stat(destFileEarly).then(() => true, () => false)) {
                                  // The dest file exists on disk, but only treat it as "already
                                  // synced" if it is actually indexed. A prior run may have copied
                                  // the file and then failed before importing it; in that case we
                                  // must fall through to the normal path so it gets imported rather
                                  // than skipped forever by this below-threshold fast path.
                                  const existsByPath = await db.findImageByFilePath(destFileEarly);
                                  if (existsByPath) {
                                      skippedCount++;
                                      return;
                                  }
                              }
                          }

                          if (imageUuid) {
                              const existsByUuid = await db.findImageByUuid(imageUuid);
                              if (existsByUuid) {
                                  skippedCount++;
                                  return;
                              }
                          }
                      }

                      if (!dateStr) {
                          skippedCount++;
                          return;
                      }

                      const year = dateStr.substring(0, 4);
                      const destDir = path.join(destRoot, camera, lens, year, dateStr);
                      const destFile = path.join(destDir, fileName);

                      // Skip files previously deleted from the gallery (deleted_images tombstones)
                      // so Sync does not resurrect them.
                      const uuidNameKey = imageUuid ? `${imageUuid} ${fileName.toLowerCase()}` : null;
                      const isTombstoned =
                          (uuidNameKey !== null && deletedKeys.uuidNameKeys.has(uuidNameKey)) ||
                          deletedKeys.originalPaths.has(db.normalizePathForDb(destFile)) ||
                          deletedKeys.originalPaths.has(destFile.replace(/\\/g, '/'));
                      if (isTombstoned) {
                          console.warn(`[Sync] Skip (previously deleted): ${fileName}`);
                          skippedCount++;
                          return;
                      }

                      if (await fs.promises.stat(destFile).then(() => true, () => false)) {
                          const existsByPath = await db.findImageByFilePath(destFile);
                          if (existsByPath) {
                              skippedCount++;
                              return;
                          }
                          if (dryRun) {
                              importOnly++;
                              // Track for the follow-up run so the import phase can `pendingImports.set` it.
                              candidates.push({
                                  sourcePath: filePath,
                                  fileName,
                                  dateStr: dateStr!,
                                  camera,
                                  lens,
                                  imageUuid,
                              });
                          } else {
                              pendingImports.set(destFile, { imageUuid });
                          }
                      } else {
                          if (dryRun) {
                              wouldCopy++;
                              const destDirExists = await fs.promises.stat(destDir).then(() => true, () => false);
                              if (!destDirExists) {
                                  newFolderRelPaths.add(syncRelDisplay(destRoot, destDir));
                              }
                              candidates.push({
                                  sourcePath: filePath,
                                  fileName,
                                  dateStr: dateStr!,
                                  camera,
                                  lens,
                                  imageUuid,
                              });
                          } else {
                              await fs.promises.mkdir(destDir, { recursive: true });
                              await fs.promises.copyFile(filePath, destFile);
                              copied++;
                              pendingImports.set(destFile, { imageUuid });
                          }
                      }
                  } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      errors.push(`${fileName}: ${msg}`);
                  } finally {
                      processedCount++;
                      if (processedCount % 5 === 0 || processedCount === totalCandidates) {
                          mainWindow?.webContents.send('sync:progress', {
                              phase: processPhase, current: processedCount, total: totalCandidates, detail: fileName
                          });
                      }
                  }
              }));
          }

          if (dryRun) {
              const sortedFolders = Array.from(newFolderRelPaths).sort();
              mainWindow?.webContents.send('sync:progress', {
                  phase: 'done', current: 0, total: 0, detail: 'Preview complete'
              });
              return {
                  dryRun: true,
                  thresholdDate,
                  destinationRoot: destRoot,
                  scanned: totalScanned,
                  skipped: skippedCount,
                  wouldCopy,
                  importOnly: importOnly,
                  newFolders: sortedFolders,
                  errors,
                  candidates,
              };
          }

          const pendingEntries = Array.from(pendingImports.entries());
          const foldersTouched = new Set(pendingEntries.map(([fp]) => path.dirname(fp)));
          let imported = 0;
          const importErrors: string[] = [];
          const folderIdCache = new Map<string, number>();
          const newImageIdsByFolder = new Map<string, number[]>();

          for (let i = 0; i < pendingEntries.length; i++) {
              const [destFileAbs, meta] = pendingEntries[i];
              const folderPath = path.dirname(destFileAbs);

              mainWindow?.webContents.send('sync:progress', {
                  phase: 'importing',
                  current: i + 1,
                  total: pendingEntries.length,
                  detail: path.relative(destRoot, destFileAbs),
              });

              const fn = path.basename(destFileAbs);
              const ft = path.extname(destFileAbs).toLowerCase().replace(/^\./, '') || 'unknown';

              try {
                  const existsByPath = await db.findImageByFilePath(destFileAbs);
                  if (existsByPath) continue;

                  let uuid: string | null = meta.imageUuid;
                  if (uuid) {
                      const existsByUuid = await db.findImageByUuid(uuid);
                      if (existsByUuid) continue;
                  } else {
                      try {
                          const tags = await exiftool.read(destFileAbs);
                          const uid = tags.ImageUniqueID ?? tags.DocumentID ?? null;
                          if (uid && typeof uid === 'string') {
                              uuid = uid;
                              const existsByUuid = await db.findImageByUuid(uuid);
                              if (existsByUuid) continue;
                          }
                      } catch { /* proceed without UUID */ }
                  }

                  let folderId = folderIdCache.get(folderPath);
                  if (folderId === undefined) {
                      folderId = await db.getOrCreateFolder(folderPath);
                      folderIdCache.set(folderPath, folderId);
                  }

                  const newImageId = await db.insertImage({
                      file_path: destFileAbs,
                      file_name: fn,
                      file_type: ft,
                      folder_id: folderId,
                      image_uuid: uuid,
                  });
                  try {
                      await db.markImageIndexingPhaseDone(newImageId);
                  } catch (phaseErr) {
                      console.warn('[Main] Sync: markImageIndexingPhaseDone failed:', phaseErr);
                  }
                  const list = newImageIdsByFolder.get(folderPath) ?? [];
                  list.push(newImageId);
                  newImageIdsByFolder.set(folderPath, list);
                  imported++;
              } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  importErrors.push(`${fn}: ${msg}`);
              }
          }

          errors.push(...importErrors);

          const processing: ScheduleResult[] = [];
          for (const [fp, ids] of newImageIdsByFolder) {
              const one = await scheduleProcessingForImages(apiService, { folderPath: fp, imageIds: ids });
              processing.push(one);
              if (one.method !== 'none') {
                  console.log('[Main] Sync schedule:', fp, ids.length, one);
              }
          }

          mainWindow?.webContents.send('sync:progress', {
              phase: 'done', current: 0, total: 0, detail: 'Sync complete'
          });

          return {
              dryRun: false,
              scanned: totalScanned,
              copied,
              imported,
              skipped: skippedCount,
              folders: foldersTouched.size,
              errors,
              thresholdDate,
              processing,
          };
      }

      ipcMain.handle('sync:preview', wrapIpcHandler(async (_, sourcePath: string) => {
          if (!sourcePath || typeof sourcePath !== 'string') {
              throw new Error('Source path is required');
          }
          const stat = await fs.promises.stat(sourcePath).catch(() => null);
          if (!stat || !stat.isDirectory()) {
              throw new Error(`Path is not a directory: ${sourcePath}`);
          }
          assertSyncPreviewAllowed(syncGuards);
          syncGuards.incrementPreviewCount();
          rebuildApplicationMenu();
          try {
              console.log(`[Main] Sync preview: source=${sourcePath}`);
              const out = await runSyncFromSource(sourcePath, true);
              if (!out.dryRun) {
                  throw new Error('Internal: expected preview result');
              }
              return {
                  thresholdDate: out.thresholdDate,
                  destinationRoot: out.destinationRoot,
                  scanned: out.scanned,
                  skipped: out.skipped,
                  wouldCopy: out.wouldCopy,
                  importOnly: out.importOnly,
                  newFolders: out.newFolders,
                  errors: out.errors,
                  candidates: out.candidates,
              };
          } finally {
              syncGuards.decrementPreviewCount();
              rebuildApplicationMenu();
          }
      }));

      ipcMain.handle('sync:run', wrapIpcHandler(async (_, sourcePath: string, pickedCandidates?: SyncCandidate[]) => {
          if (!sourcePath || typeof sourcePath !== 'string') {
              throw new Error('Source path is required');
          }
          const stat = await fs.promises.stat(sourcePath).catch(() => null);
          if (!stat || !stat.isDirectory()) {
              throw new Error(`Path is not a directory: ${sourcePath}`);
          }
          assertSyncRunAllowed(syncGuards);
          syncGuards.setSyncRunInProgress(true);
          rebuildApplicationMenu();
          try {
              const out = await runSyncFromSource(sourcePath, false, pickedCandidates);
              if (out.dryRun) {
                  throw new Error('Internal: expected sync result');
              }
              return {
                  scanned: out.scanned,
                  copied: out.copied,
                  imported: out.imported,
                  skipped: out.skipped,
                  folders: out.folders,
                  errors: out.errors,
                  thresholdDate: out.thresholdDate,
                  processing: out.processing,
              };
          } finally {
              syncGuards.setSyncRunInProgress(false);
              rebuildApplicationMenu();
          }
      }));
}

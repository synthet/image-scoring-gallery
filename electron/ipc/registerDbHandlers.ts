import fs from 'fs';
import type { IpcMain } from 'electron';
import type { ApiService } from '../apiService';
import type { TextSearchParams } from '../apiTypes';
import * as db from '../db';
import { wrapIpcHandler } from './wrapIpcHandler';

export type DbHandlersDeps = {
  ipcMain: IpcMain;
  apiService: ApiService;
};

export function registerDbHandlers(deps: DbHandlersDeps): void {
  const { ipcMain, apiService } = deps;

  ipcMain.handle('ping', () => 'pong');

      ipcMain.handle('db:check-connection', wrapIpcHandler(async () => {
          return await db.checkConnection();
      }));

      ipcMain.handle('db:get-image-count', wrapIpcHandler(async (_, options) => {
          return await db.getImageCount(options);
      }));

      ipcMain.handle('db:get-images', wrapIpcHandler(async (_, options) => {
          return await db.getImages(options);
      }));

      ipcMain.handle('db:get-image-details', wrapIpcHandler(async (_, id) => {
          console.log(`[Main] Getting image details for ID: ${id}`);
          const result = await db.getImageDetails(id);
          console.log(`[Main] Image details result:`, result ? 'Data received' : 'NULL returned');
          if (result) {
              console.log(`[Main] Image details keys:`, Object.keys(result));
          }
          return result;
      }));

      ipcMain.handle('db:get-image-phase-statuses', wrapIpcHandler(async (_, id) => {
          return await db.getImagePhaseStatuses(id);
      }));

      ipcMain.handle('db:update-image-details', wrapIpcHandler(async (_, { id, updates }) => {
          console.log(`[Main] Updating image details for ID: ${id}`, updates);
          return await db.updateImageDetails(id, updates);
      }));

      ipcMain.handle('db:delete-image', wrapIpcHandler(async (_, id) => {
          console.log(`[Main] Deleting image ID: ${id}`);
          return await db.deleteImage(id);
      }));

      ipcMain.handle('db:get-keywords', wrapIpcHandler(async () => {
          return await db.getKeywords();
      }));

      ipcMain.handle('db:get-keyword-cloud', wrapIpcHandler(async (_, options: {
          kind: 'general' | 'species';
          limit?: number;
          folderId?: number;
      }) => {
          return await db.getKeywordCloud(options);
      }));

      ipcMain.handle('api:similarity:find-duplicates', wrapIpcHandler(async (_, options) => {
          console.log(`[Main] Finding near duplicates via backend API`, options);
          return await apiService.findDuplicates(options);
      }));

      ipcMain.handle('api:similarity:search', wrapIpcHandler(async (_, options) => {
          console.log(`[Main] Finding similar images via backend API`, options);
          const { imageId, limit, folderId, folderPath, minSimilarity } = options;
          if (!imageId) throw new Error("image_id is required");

          const resolvedFolderPath = folderPath || (folderId ? await db.getFolderPathById(folderId) : undefined) || undefined;

          return await apiService.searchSimilar({
              image_id: imageId,
              limit,
              folder_path: resolvedFolderPath,
              min_similarity: minSimilarity,
          });
      }));

      let textSearchAbort: AbortController | null = null;

      ipcMain.handle('api:similarity:text-search', wrapIpcHandler(async (_, options: TextSearchParams) => {
          textSearchAbort?.abort();
          textSearchAbort = new AbortController();
          const signal = textSearchAbort.signal;
          try {
              return await apiService.textSearch(options, signal);
          } finally {
              if (textSearchAbort?.signal === signal) {
                  textSearchAbort = null;
              }
          }
      }));

      ipcMain.handle('api:similarity:text-search-cancel', () => {
          textSearchAbort?.abort();
          textSearchAbort = null;
          return { ok: true };
      });

      ipcMain.handle('api:similarity:example-queries', wrapIpcHandler(async (_, options?: {
          limit?: number;
          folder_path?: string;
      }) => {
          return await apiService.getSearchExampleQueries(options);
      }));

      ipcMain.handle('api:similarity:outliers', wrapIpcHandler(async (_, options) => {
          console.log(`[Main] Finding outliers via backend API`, options);
          const { folderPath, zThreshold, k, limit } = options;
          if (!folderPath) throw new Error("folder_path is required");
          return await apiService.getOutliers({
              folder_path: folderPath,
              z_threshold: zThreshold,
              k,
              limit,
          });
      }));

      ipcMain.handle('db:get-stacks', wrapIpcHandler(async (_, options) => {
          return await db.getStacks(options);
      }));

      ipcMain.handle('db:get-images-by-stack', wrapIpcHandler(async (_, { stackId, options }) => {
          return await db.getImagesByStack(stackId, options);
      }));

      ipcMain.handle('db:get-images-by-stack-ungrouped', wrapIpcHandler(async (_, { stackId, options }) => {
          return await db.getImagesByStackUngrouped(stackId, options);
      }));

      ipcMain.handle('db:get-substacks-for-stack', wrapIpcHandler(async (_, payload: number | { stackId: number; options?: db.ImageQueryOptions }) => {
          const stackId = typeof payload === 'number' ? payload : payload.stackId;
          const options = typeof payload === 'number' ? undefined : payload.options;
          return await db.getSubstacksForStack(stackId, options);
      }));

      ipcMain.handle('db:get-images-by-substack', wrapIpcHandler(async (_, { subStackId, options }) => {
          return await db.getImagesBySubStack(subStackId, options);
      }));

      ipcMain.handle('db:get-stack-count', wrapIpcHandler(async (_, options) => {
          return await db.getStackCount(options);
      }));

      ipcMain.handle('db:get-stack-cache-count', wrapIpcHandler(async () => {
          return await db.getStackCacheCount();
      }));

      ipcMain.handle('db:get-stack-cache-status', wrapIpcHandler(async () => {
          return await db.getStackCacheStatus();
      }));

      ipcMain.handle('db:rebuild-stack-cache', wrapIpcHandler(async (_, context) => {
          const count = await db.rebuildStackCache(context ?? {});
          return { success: true, count };
      }));

      ipcMain.handle('db:get-dates-with-shots', wrapIpcHandler(async (_, options) => {
          return db.getDatesWithShots(options ?? {});
      }));

      ipcMain.handle('db:get-folders', wrapIpcHandler(async () => {
          const rawFolders = await db.getFolders() as { path: string;[key: string]: unknown }[];


          const convertPathToLocal = (p: string) => {
              const isWindows = process.platform === 'win32';
              if (isWindows) {
                  const pStr = p.replace(/\\/g, '/');
                  if (pStr.startsWith('/mnt/')) {
                      const parts = pStr.split('/');
                      if (parts.length > 2 && parts[2].length === 1) {
                          const drive = parts[2].toUpperCase();
                          const rest = parts.slice(3).join('/');
                          return `${drive}:/${rest}`;
                      }
                  }
              }
              return p;
          };

          const processed = rawFolders.map((f: { path: string;[key: string]: unknown }) => {
              return { ...f, path: convertPathToLocal(f.path) };
          }).filter((f: { path: string }) => {
              if (process.platform === 'win32') {
                  const isDrivePath = /^[a-zA-Z]:/.test(f.path);
                  if (!isDrivePath) return false;
                  if (f.path.startsWith('/mnt') || f.path === '/' || f.path === '.') return false;
                  return true;
              }
              return true;
          });

          const existsAsDir = async (dirPath: string): Promise<boolean> => {
              try {
                  const st = await fs.promises.stat(dirPath);
                  return st.isDirectory();
              } catch {
                  return false;
              }
          };

          const flags = await Promise.all(processed.map((f: { path: string }) => existsAsDir(f.path)));
          return processed.filter((_: unknown, i: number) => flags[i]);
      }));

      ipcMain.handle('db:delete-folder', wrapIpcHandler(async (_, id) => {
          console.log(`[Main] Deleting folder ID: ${id}`);
          return await db.deleteFolder(id);
      }));
}

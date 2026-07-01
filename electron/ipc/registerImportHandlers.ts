import fs from 'fs';
import path from 'path';
import type { BrowserWindow, IpcMain } from 'electron';
import type { ExifTool } from 'exiftool-vendored';
import type { ApiService } from '../apiService';
import * as db from '../db';
import {
    scheduleProcessingForImages,
    scheduleProcessingForImportedFolder,
} from '../scheduleProcessing';
import { FS_IMAGE_EXTENSIONS } from '../fsMetadataHelpers';
import { wrapIpcHandler } from './wrapIpcHandler';

export type ImportHandlersDeps = {
    ipcMain: IpcMain;
    apiService: ApiService;
    exiftool: ExifTool;
    getMainWindow: () => BrowserWindow | null;
};

export function registerImportHandlers(deps: ImportHandlersDeps): void {
    const { ipcMain, apiService, exiftool, getMainWindow } = deps;

    ipcMain.handle('import:run', wrapIpcHandler(async (_, folderPath: string) => {
        if (!folderPath || typeof folderPath !== 'string') {
            throw new Error('Folder path is required');
        }
        const stat = await fs.promises.stat(folderPath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${folderPath}`);
        }

        const useApi = await apiService.isAvailable();
        if (useApi) {
            try {
                console.log('[Main] Import via API (Gradio backend)');
                const res = await apiService.importRegister({ folder_path: folderPath });
                const data = res?.data;
                const added = data?.added ?? 0;
                const skipped = data?.skipped ?? 0;
                const errs = data?.errors ?? [];
                const total = added + skipped + errs.length;
                const mainWindow = getMainWindow();
                if (total > 0) {
                    mainWindow?.webContents.send('import:progress', { current: total, total, path: '' });
                }
                const processing = await scheduleProcessingForImportedFolder(apiService, folderPath, added);
                if (processing.method !== 'none') {
                    console.log('[Main] Import (API) schedule:', folderPath, processing);
                }
                return { added, skipped, errors: errs, processing };
            } catch (e) {
                console.warn('[Main] Import via API failed, falling back to direct DB:', e);
            }
        } else {
            console.log('[Main] Gradio not available, using direct local DB for import');
        }

        const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
        const files = entries
            .filter(e => e.isFile())
            .map(e => path.join(folderPath, e.name))
            .filter(p => FS_IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase()));

        const total = files.length;
        let added = 0;
        let skipped = 0;
        const errors: string[] = [];

        const folderId = await db.getOrCreateFolder(folderPath);
        const newImageIds: number[] = [];

        for (let i = 0; i < files.length; i++) {
            const filePath = files[i];
            const fileName = path.basename(filePath);
            const fileType = path.extname(filePath).toLowerCase().replace(/^\./, '') || 'unknown';

            getMainWindow()?.webContents.send('import:progress', { current: i + 1, total, path: filePath });

            try {
                const existsByPath = await db.findImageByFilePath(filePath);
                if (existsByPath) {
                    skipped++;
                    continue;
                }

                let imageUuid: string | null = null;
                try {
                    const tags = await exiftool.read(filePath);
                    const uid = tags.ImageUniqueID ?? tags.DocumentID ?? null;
                    if (uid && typeof uid === 'string') {
                        imageUuid = uid;
                        const existsByUuid = await db.findImageByUuid(imageUuid);
                        if (existsByUuid) {
                            skipped++;
                            continue;
                        }
                    }
                } catch {
                    /* No EXIF or read failed */
                }

                const newImageId = await db.insertImage({
                    file_path: filePath,
                    file_name: fileName,
                    file_type: fileType,
                    folder_id: folderId,
                    image_uuid: imageUuid,
                });
                try {
                    await db.markImageIndexingPhaseDone(newImageId);
                } catch (phaseErr) {
                    console.warn('[Main] Import: markImageIndexingPhaseDone failed:', phaseErr);
                }
                newImageIds.push(newImageId);
                added++;
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                errors.push(`${fileName}: ${msg}`);
            }
        }

        const processing = await scheduleProcessingForImages(apiService, {
            folderPath,
            imageIds: newImageIds,
        });
        if (processing.method !== 'none') {
            console.log('[Main] Import (direct DB) schedule:', folderPath, newImageIds.length, processing);
        }
        return { added, skipped, errors, processing };
    }));
}

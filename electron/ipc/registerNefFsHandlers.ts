import fs from 'fs';
import path from 'path';
import { BrowserWindow, dialog } from 'electron';
import type { IpcMain } from 'electron';
import type { ExifTool } from 'exiftool-vendored';
import { nefExtractor } from '../nefExtractor';
import {
    convertFsImagePathForExif,
    FS_IMAGE_EXTENSIONS,
    isPathInsideLightRoot,
    mergeXmpOverImage,
    metadataDetailFromTags,
    readExiftoolAsPlain,
    readLightModeRootFromConfig,
} from '../fsMetadataHelpers';
import { extractNefPreviewEnvelope, mainHandlerFs } from '../main.handlers';
import type { FileImageMetadataResult, FsDirEntry, FsReadDirResult } from '../types';
import { wrapIpcHandler } from './wrapIpcHandler';

export type NefFsHandlersDeps = {
    ipcMain: IpcMain;
    exiftool: ExifTool;
    getMainWindow: () => BrowserWindow | null;
    electronDirname: string;
};

export function registerNefFsHandlers(deps: NefFsHandlersDeps): void {
    const { ipcMain, exiftool, getMainWindow, electronDirname } = deps;

    ipcMain.handle('nef:extract-preview', wrapIpcHandler(async (_, filePath: string) => {
        console.log(`[Main] NEF preview requested for: ${filePath}`);
        return await extractNefPreviewEnvelope(filePath, {
            platform: process.platform,
            readFile: mainHandlerFs.readFile,
            extractPreview: (p) => nefExtractor.extractPreview(p),
        });
    }));

    ipcMain.handle('nef:read-exif', wrapIpcHandler(async (_, filePath: string) => {
        try {
            console.log(`[Main] EXIF read requested for: ${filePath}`);
            let convertedPath = filePath;
            if (process.platform === 'win32' && filePath.match(/^\/mnt\/[a-zA-Z]\//)) {
                convertedPath = filePath.replace(/^\/mnt\/([a-zA-Z])\//, '$1:/');
            }
            return await exiftool.read(convertedPath);
        } catch (e: unknown) {
            console.error('[Main] EXIF read error:', e);
            throw e;
        }
    }));

    ipcMain.handle('fs:read-image-metadata', wrapIpcHandler(async (_, filePath: string) => {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('file path required');
        }
        const convertedPath = convertFsImagePathForExif(filePath);
        let merged = await readExiftoolAsPlain(exiftool, convertedPath);
        const dir = path.dirname(convertedPath);
        const base = path.basename(convertedPath, path.extname(convertedPath));
        const xmpPath = path.join(dir, `${base}.xmp`);
        try {
            await fs.promises.access(xmpPath, fs.constants.R_OK);
            const xmpPlain = await readExiftoolAsPlain(exiftool, xmpPath);
            merged = mergeXmpOverImage(merged, xmpPlain);
        } catch {
            /* no readable sidecar */
        }
        const detail = metadataDetailFromTags(merged);
        const result: FileImageMetadataResult = { tags: merged, detail };
        return result;
    }));

    ipcMain.handle('fs:get-light-mode-root', wrapIpcHandler(async () => readLightModeRootFromConfig(electronDirname)));

    ipcMain.handle('fs:read-dir', wrapIpcHandler(async (_, args: {
        dirPath: string;
        offset?: number;
        limit?: number;
        kinds?: 'all' | 'dirsOnly';
    }) => {
        const rootPath = readLightModeRootFromConfig(electronDirname);
        const dirPath = typeof args?.dirPath === 'string' ? args.dirPath : '';
        const resolvedDir = path.resolve(dirPath);
        if (!isPathInsideLightRoot(rootPath, resolvedDir)) {
            throw new Error('Directory is outside the configured light mode root');
        }
        let stat: fs.Stats;
        try {
            stat = await fs.promises.stat(resolvedDir);
        } catch {
            throw new Error('Directory not found');
        }
        if (!stat.isDirectory()) {
            throw new Error('Not a directory');
        }
        const kinds = args.kinds ?? 'all';
        const names = await fs.promises.readdir(resolvedDir);
        const directories: FsDirEntry[] = [];
        const allImages: FsDirEntry[] = [];
        const statRows = await Promise.all(
            names.map(async (name) => {
                if (name === '.' || name === '..') {
                    return null;
                }
                const full = path.join(resolvedDir, name);
                try {
                    const st = await fs.promises.stat(full);
                    return { name, full, st };
                } catch {
                    return null;
                }
            }),
        );
        for (const row of statRows) {
            if (!row) {
                continue;
            }
            const { name, full, st } = row;
            if (st.isDirectory()) {
                directories.push({ name, path: full });
            } else if (kinds !== 'dirsOnly' && st.isFile()) {
                const ext = path.extname(name).toLowerCase();
                if (FS_IMAGE_EXTENSIONS.has(ext)) {
                    allImages.push({ name, path: full });
                }
            }
        }
        const sortByName = (a: FsDirEntry, b: FsDirEntry) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        directories.sort(sortByName);
        allImages.sort(sortByName);
        const offset = Math.max(0, Number(args.offset) || 0);
        const limit = Math.min(500, Math.max(1, Number(args.limit) || 80));
        const totalImageCount = allImages.length;
        const images = kinds === 'dirsOnly' ? [] : allImages.slice(offset, offset + limit);
        const result: FsReadDirResult = {
            dirPath: resolvedDir,
            directories,
            images,
            totalImageCount,
            rootPath,
        };
        return result;
    }));

    ipcMain.handle('fs:select-directory', wrapIpcHandler(async () => {
        const mainWindow = getMainWindow();
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
        const result = await dialog.showOpenDialog(win || mainWindow!, {
            properties: ['openDirectory'],
            title: 'Choose folder',
        });
        if (result.canceled || !result.filePaths[0]) {
            return null;
        }
        return result.filePaths[0];
    }));
}

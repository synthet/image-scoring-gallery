import path from 'path';
import { dialog } from 'electron';
import type { BrowserWindow, IpcMain } from 'electron';
import { exportOriginals } from '../exportOriginals';
import type { ExportOriginalsResult } from '../types';
import { wrapIpcHandler } from './wrapIpcHandler';

export type ExportHandlersDeps = {
    ipcMain: IpcMain;
    getMainWindow: () => BrowserWindow | null;
    /** The same rule as media://: the renderer can't copy a file it couldn't display. */
    isGalleryFile: (file: string) => Promise<boolean>;
};

/** The database can hold WSL paths (/mnt/d/...), which a Windows copy can't open. */
function toLocalPath(file: string): string {
    if (process.platform !== 'win32') return file;
    return path.normalize(file.replace(/^\/mnt\/([a-zA-Z])\//, '$1:/'));
}

function summary({ total, copied, failed, cancelled }: ExportOriginalsResult, destDir: string): string {
    const head = cancelled ? `Export cancelled: ${copied} of ${total} copied` : `Exported ${copied} of ${total}`;
    return `${head} to:\n${destDir}${failed.length > 0 ? `\n${failed.length} failed` : ''}`;
}

export function registerExportHandlers(deps: ExportHandlersDeps): void {
    const { ipcMain, getMainWindow, isGalleryFile } = deps;

    // The running export, if any; export:originals-cancel stops it between files.
    let running: AbortController | null = null;

    ipcMain.handle('export:originals-cancel', wrapIpcHandler(async () => {
        if (!running) return false;
        running.abort();
        return true;
    }));

    ipcMain.handle('export:originals', wrapIpcHandler(async (_, filePaths: string[]) => {
        if (!Array.isArray(filePaths) || filePaths.length === 0 || filePaths.some((p) => typeof p !== 'string')) {
            throw new Error('File paths are required');
        }
        if (running) throw new Error('An export is already running');

        const win = getMainWindow();
        const options: Electron.OpenDialogOptions = {
            title: 'Export originals to folder',
            properties: ['openDirectory', 'createDirectory'],
        };
        const picked = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options));
        if (picked.canceled || !picked.filePaths[0]) return null;
        const destDir = picked.filePaths[0];

        const controller = new AbortController();
        running = controller;
        try {
            const result = await exportOriginals(filePaths.map(toLocalPath), destDir, {
                isGalleryFile,
                signal: controller.signal,
                onProgress: (current, total) => getMainWindow()?.webContents.send('export:originals-progress', { current, total }),
            });
            for (const { file, error } of result.failed) console.error('[Main] Export originals failed:', file, error);
            getMainWindow()?.webContents.send('show-notification', {
                message: summary(result, destDir),
                type: result.failed.length > 0 ? 'warning' : 'success',
            });
            return result;
        } finally {
            running = null;
        }
    }));
}

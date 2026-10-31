import crypto from 'crypto';
import fs from 'fs';
import { BrowserWindow, dialog } from 'electron';
import type { IpcMain } from 'electron';
import * as db from '../db';
import {
    buildRepresentativePreview,
    type RepresentativeLiveFlags,
    type RepresentativePreviewLoad,
} from '../representativePreview';
import { wrapIpcHandler } from './wrapIpcHandler';

/** Study manifests are a few MB per shoot; refuse anything far larger before parsing. */
export const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

export type RepresentativePreviewDeps = {
    readFile: (filePath: string) => Promise<Buffer>;
    getFolderImageFlags: (folderId: number) => Promise<RepresentativeLiveFlags[]>;
    getFolderImages: (folderId: number, limit: number) => Promise<unknown[]>;
};

/** Read-only: reads the chosen manifest and the folder's rows; never writes the catalog or files. */
export async function loadRepresentativePreview(
    filePath: string,
    folderId: number,
    deps: RepresentativePreviewDeps,
): Promise<RepresentativePreviewLoad> {
    let bytes: Buffer;
    let json: unknown;
    try {
        bytes = await deps.readFile(filePath);
        if (bytes.length > MAX_MANIFEST_BYTES) {
            return { preview: { status: 'fallback', reason: 'unreadable', detail: 'manifest is larger than 64 MB' }, images: [] };
        }
        json = JSON.parse(bytes.toString('utf8'));
    } catch (e) {
        return { preview: { status: 'fallback', reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) }, images: [] };
    }
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const flags = await deps.getFolderImageFlags(folderId);
    const preview = buildRepresentativePreview(json, sha256, flags);
    if (preview.status !== 'ok') return { preview, images: [] };
    const images = await deps.getFolderImages(folderId, flags.length + 1);
    const shown = new Set(images.map((row) => (row as { id?: unknown }).id));
    if (images.length !== flags.length || flags.some((f) => !shown.has(f.id))) {
        return {
            preview: { status: 'fallback', reason: 'stale_membership', detail: 'folder rows changed while loading' },
            images: [],
        };
    }
    return { preview, images };
}

export type StudyHandlersDeps = {
    ipcMain: IpcMain;
    getMainWindow: () => BrowserWindow | null;
};

export function registerStudyHandlers(deps: StudyHandlersDeps): void {
    const { ipcMain, getMainWindow } = deps;

    ipcMain.handle('study:load-representative-preview', wrapIpcHandler(async (_, folderId: number) => {
        if (!Number.isInteger(folderId)) {
            throw new Error('Open a folder before loading a representative preview');
        }
        const mainWindow = getMainWindow();
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
        const result = await dialog.showOpenDialog(win || mainWindow!, {
            properties: ['openFile'],
            filters: [{ name: 'Representative preview', extensions: ['json'] }],
            title: 'Open representative preview manifest',
        });
        if (result.canceled || !result.filePaths[0]) {
            return { preview: { status: 'fallback', reason: 'cancelled', detail: 'no manifest chosen' }, images: [] };
        }
        return await loadRepresentativePreview(result.filePaths[0], folderId, {
            readFile: (p) => fs.promises.readFile(p),
            getFolderImageFlags: (id) => db.getFolderImageFlags(id),
            getFolderImages: (id, limit) => db.getImagesByStack(null, { folderId: id, limit }),
        });
    }));
}

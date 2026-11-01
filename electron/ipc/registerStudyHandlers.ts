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
import {
    buildKeepOneReview,
    keepOneImageIds,
    type KeepOneLiveRow,
    type KeepOneReviewResult,
} from '../keepOneReview';
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

export type KeepOneReviewDeps = {
    readFile: (filePath: string) => Promise<Buffer>;
    getImages: (ids: number[]) => Promise<KeepOneLiveRow[]>;
};

/** Read-only: reads the chosen keep-one export and the referenced catalog rows; never writes anything. */
export async function loadKeepOneReview(filePath: string, deps: KeepOneReviewDeps): Promise<KeepOneReviewResult> {
    let bytes: Buffer;
    let json: unknown;
    try {
        bytes = await deps.readFile(filePath);
        if (bytes.length > MAX_MANIFEST_BYTES) {
            return { status: 'fallback', reason: 'unreadable', detail: 'export is larger than 64 MB' };
        }
        json = JSON.parse(bytes.toString('utf8'));
    } catch (e) {
        return { status: 'fallback', reason: 'unreadable', detail: e instanceof Error ? e.message : String(e) };
    }
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const ids = keepOneImageIds(json);
    const rows = ids.length > 0 ? await deps.getImages(ids) : [];
    return buildKeepOneReview(json, sha256, rows);
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

    ipcMain.handle('study:load-keepone-review', wrapIpcHandler(async () => {
        const mainWindow = getMainWindow();
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
        const result = await dialog.showOpenDialog(win || mainWindow!, {
            properties: ['openFile'],
            filters: [{ name: 'Keep-one review export', extensions: ['json'] }],
            title: 'Open keep-one review export',
        });
        if (result.canceled || !result.filePaths[0]) {
            return { status: 'fallback', reason: 'cancelled', detail: 'no export chosen' } satisfies KeepOneReviewResult;
        }
        return await loadKeepOneReview(result.filePaths[0], {
            readFile: (p) => fs.promises.readFile(p),
            getImages: (ids) => db.getImagesForKeepOneReview(ids),
        });
    }));
}

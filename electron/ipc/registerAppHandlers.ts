import type { IpcMain } from 'electron';
import type { ExportImageContext } from '../types';
import { revealInExplorer } from '../revealInExplorer';
import { wrapIpcHandler } from './wrapIpcHandler';

export type AppHandlersDeps = {
    ipcMain: IpcMain;
    getGalleryMode: () => 'db' | 'folder';
    setGalleryMode: (mode: 'db' | 'folder') => void;
    setSingleImageViewOpen: (open: boolean) => void;
    getSelectionPath: () => string | null;
    setSelectionPath: (path: string | null) => void;
    getExportContext: () => ExportImageContext | null;
    setExportContext: (context: ExportImageContext | null) => void;
    getShowBoundingBox: () => boolean;
    getShowEyes: () => boolean;
    getShowFocusPoint: () => boolean;
    setShowBoundingBox: (show: boolean) => void;
    setShowEyes: (show: boolean) => void;
    setShowFocusPoint: (show: boolean) => void;
    rebuildApplicationMenu: () => void;
};

export function registerAppHandlers(deps: AppHandlersDeps): void {
    const { ipcMain, rebuildApplicationMenu } = deps;

    ipcMain.handle('app:set-gallery-mode', wrapIpcHandler(async (_, mode: unknown) => {
        if (mode !== 'db' && mode !== 'folder') {
            throw new Error('Invalid gallery mode');
        }
        deps.setGalleryMode(mode);
        rebuildApplicationMenu();
        return mode;
    }));

    ipcMain.handle('app:get-gallery-mode', () => deps.getGalleryMode());

    ipcMain.handle('app:set-viewer-open', wrapIpcHandler(async (_, open: unknown) => {
        if (typeof open !== 'boolean') throw new Error('open must be a boolean');
        deps.setSingleImageViewOpen(open);
        rebuildApplicationMenu();
        return true;
    }));

    ipcMain.handle('app:get-show-bounding-box', () => deps.getShowBoundingBox());
    ipcMain.handle('app:get-show-eyes', () => deps.getShowEyes());
    ipcMain.handle('app:get-show-focus-point', () => deps.getShowFocusPoint());

    for (const [channel, setter] of [
        ['app:set-show-bounding-box', deps.setShowBoundingBox],
        ['app:set-show-eyes', deps.setShowEyes],
        ['app:set-show-focus-point', deps.setShowFocusPoint],
    ] as const) {
        ipcMain.handle(channel, wrapIpcHandler(async (_, show: unknown) => {
            if (typeof show !== 'boolean') throw new Error('show must be a boolean');
            setter(show);
            return true;
        }));
    }

    ipcMain.handle('export:set-current-image-context', async (_, context: ExportImageContext | null) => {
        deps.setExportContext(context);
        rebuildApplicationMenu();
        return true;
    });

    ipcMain.handle('app:set-selection-path', async (_, filePath: string | null) => {
        deps.setSelectionPath(filePath);
        rebuildApplicationMenu();
        return true;
    });

    ipcMain.handle(
        'app:reveal-in-explorer',
        wrapIpcHandler(async (_, filePath: unknown) => {
            if (typeof filePath !== 'string' || !filePath.trim()) {
                throw new Error('filePath must be a non-empty string');
            }
            revealInExplorer(filePath);
            return true;
        }),
    );
}

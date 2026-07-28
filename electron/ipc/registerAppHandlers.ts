import type { IpcMain } from 'electron';
import type { ExportImageContext } from '../types';
import { revealInExplorer } from '../revealInExplorer';
import { wrapIpcHandler } from './wrapIpcHandler';

export type AppHandlersDeps = {
    ipcMain: IpcMain;
    getGalleryMode: () => 'db' | 'folder';
    setGalleryMode: (mode: 'db' | 'folder') => void;
    getSelectionPath: () => string | null;
    setSelectionPath: (path: string | null) => void;
    getExportContext: () => ExportImageContext | null;
    setExportContext: (context: ExportImageContext | null) => void;
    getShowBoundingBox: () => boolean;
    setSingleImageViewOpen: (open: boolean) => void;
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

    // Renderer reports single-image viewer open/close (kept for future menu state; Bounding Box is always enabled).
    ipcMain.handle('app:set-viewer-open', async (_, open: unknown) => {
        deps.setSingleImageViewOpen(Boolean(open));
        rebuildApplicationMenu();
        return true;
    });

    ipcMain.handle('app:get-show-bounding-box', () => deps.getShowBoundingBox());

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

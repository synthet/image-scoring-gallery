import { BrowserWindow, Menu, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { SyncGuards } from './main.handlers';
import type { ExportImageContext } from './types';
import { revealInExplorer } from './revealInExplorer';

export type ApplicationMenuDeps = {
    getMainWindow: () => BrowserWindow | null;
    getDialogWindow: () => BrowserWindow | null;
    showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
    getGalleryMode: () => 'db' | 'folder';
    setGalleryMode: (mode: 'db' | 'folder') => void;
    getShowBoundingBox: () => boolean;
    setShowBoundingBox: (show: boolean) => void;
    syncGuards: SyncGuards;
    getIsBackupRunning: () => boolean;
    getExportContext: () => ExportImageContext | null;
    getSelectionPath: () => string | null;
    exportCurrentImage: () => Promise<void>;
    openScoringWindow: () => void;
};

export function createApplicationMenu(deps: ApplicationMenuDeps): { rebuildApplicationMenu: () => void } {
    const rebuildApplicationMenu = () => {
        const folderMode = deps.getGalleryMode() === 'folder';
        const mainWindow = deps.getMainWindow();
        const isBackupRunning = deps.getIsBackupRunning();
        const syncGuards = deps.syncGuards;
        const currentExportImageContext = deps.getExportContext();
        const currentSelectionPath = deps.getSelectionPath();

        const menu = Menu.buildFromTemplate([
            {
                label: 'File',
                submenu: [
                    {
                        label: 'Settings',
                        click: () => {
                            if (mainWindow) {
                                mainWindow.webContents.send('open-settings');
                            }
                        },
                    },
                    {
                        label: 'Import',
                        enabled: !folderMode,
                        click: async () => {
                            const win = deps.getDialogWindow();
                            const result = await dialog.showOpenDialog(win || mainWindow!, {
                                properties: ['openDirectory'],
                                title: 'Select folder to import',
                            });
                            if (!result.canceled && result.filePaths[0]) {
                                mainWindow?.webContents.send('import:folder-selected', result.filePaths[0]);
                            }
                        },
                    },
                    {
                        label: 'Sync',
                        enabled: !folderMode && !syncGuards.isSyncRunInProgress() && syncGuards.activeSyncPreviewCount() === 0 && !isBackupRunning,
                        click: async () => {
                            const win = deps.getDialogWindow();
                            const result = await dialog.showOpenDialog(win || mainWindow!, {
                                properties: ['openDirectory'],
                                title: 'Select source drive or folder to sync from',
                            });
                            if (!result.canceled && result.filePaths[0]) {
                                mainWindow?.webContents.send('sync:source-selected', result.filePaths[0]);
                            }
                        },
                    },
                    {
                        label: 'Backup',
                        enabled: !folderMode && !isBackupRunning && !syncGuards.isSyncRunInProgress() && syncGuards.activeSyncPreviewCount() === 0,
                        click: async () => {
                            const win = deps.getDialogWindow();
                            let defaultPath: string | undefined;
                            try {
                                const sessionsPath = path.join(app.getPath('userData'), 'drive-sessions.json');
                                const raw = await fs.promises.readFile(sessionsPath, 'utf8').catch(() => '');
                                if (raw) {
                                    const all = JSON.parse(raw) as Record<string, {
                                        backup?: { lastTargetRoot?: string; lastBackupAt?: string };
                                    }>;
                                    let bestAt = '';
                                    for (const session of Object.values(all)) {
                                        const at = session.backup?.lastBackupAt ?? '';
                                        const root = session.backup?.lastTargetRoot;
                                        if (root && at >= bestAt) {
                                            bestAt = at;
                                            defaultPath = root;
                                        }
                                    }
                                }
                            } catch {
                                /* ignore */
                            }
                            const result = await dialog.showOpenDialog(win || mainWindow!, {
                                properties: ['openDirectory', 'createDirectory'],
                                title: 'Select Destination Folder for Backup',
                                ...(defaultPath ? { defaultPath } : {}),
                            });
                            if (!result.canceled && result.filePaths[0]) {
                                mainWindow?.webContents.send('backup:target-selected', result.filePaths[0]);
                            }
                        },
                    },
                    { type: 'separator' },
                    {
                        label: 'Export',
                        enabled: !!currentExportImageContext?.imageBytes?.length,
                        click: async () => {
                            try {
                                await deps.exportCurrentImage();
                            } catch (e: unknown) {
                                console.error('[Main] Export image error:', e);
                                await deps.showMessageBox({
                                    type: 'error',
                                    title: 'Export Failed',
                                    message: e instanceof Error ? e.message : 'Failed to export image.',
                                });
                            }
                        },
                    },
                    {
                        label: 'Reveal in Explorer',
                        enabled: !!currentSelectionPath || !!currentExportImageContext?.sourcePath,
                        click: () => {
                            const pathToReveal = currentSelectionPath || currentExportImageContext?.sourcePath;
                            if (pathToReveal) {
                                try {
                                    revealInExplorer(pathToReveal);
                                } catch (e: unknown) {
                                    console.error('[Main] Reveal in Explorer failed:', e);
                                }
                            }
                        },
                    },
                    { type: 'separator' },
                    { role: 'quit' },
                ],
            },
            {
                label: 'Tools',
                submenu: [
                    {
                        label: 'Diagnostics',
                        enabled: !folderMode,
                        click: () => {
                            if (mainWindow) {
                                mainWindow.webContents.send('open-diagnostics');
                            }
                        },
                    },
                    { type: 'separator' },
                    {
                        label: 'Search',
                        enabled: !folderMode,
                        click: () => {
                            if (mainWindow) {
                                mainWindow.webContents.send('open-search');
                            }
                        },
                    },
                    {
                        label: 'Keywords',
                        enabled: !folderMode,
                        click: () => {
                            if (mainWindow) {
                                mainWindow.webContents.send('open-keywords');
                            }
                        },
                    },
                    {
                        label: 'Scoring...',
                        enabled: !folderMode,
                        click: () => {
                            deps.openScoringWindow();
                        },
                    },
                ],
            },
            { role: 'editMenu' },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' },
                    { type: 'separator' },
                    {
                        label: 'Bounding Box',
                        type: 'checkbox',
                        checked: deps.getShowBoundingBox(),
                        click: (item) => deps.setShowBoundingBox(item.checked),
                    },
                    { type: 'separator' },
                    {
                        label: 'Mode: DB',
                        type: 'radio',
                        checked: deps.getGalleryMode() === 'db',
                        click: () => deps.setGalleryMode('db'),
                    },
                    {
                        label: 'Mode: Folder',
                        type: 'radio',
                        checked: deps.getGalleryMode() === 'folder',
                        click: () => deps.setGalleryMode('folder'),
                    },
                ],
            },
            { role: 'windowMenu' },
        ]);

        Menu.setApplicationMenu(menu);
    };

    return { rebuildApplicationMenu };
}

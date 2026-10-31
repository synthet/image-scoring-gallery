import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    Menu: { buildFromTemplate: vi.fn((template) => template), setApplicationMenu: vi.fn() },
    dialog: {}, app: {},
}));
vi.mock('./revealInExplorer', () => ({ revealInExplorer: vi.fn() }));

import { Menu } from 'electron';
import { createApplicationMenu, type ApplicationMenuDeps } from './menu';

describe('Image menu', () => {
    it('appears only while the viewer is open and dispatches similarity search', () => {
        let viewerOpen = false;
        let folderMode = false;
        const send = vi.fn();
        const deps = {
            getMainWindow: () => ({ webContents: { send } }),
            getGalleryMode: () => folderMode ? 'folder' : 'db',
            getIsSingleImageViewOpen: () => viewerOpen,
            getIsBackupRunning: () => false,
            getExportContext: () => null,
            getSelectionPath: () => null,
            getShowBoundingBox: () => false,
            getShowEyes: () => false,
            getShowFocusPoint: () => false,
            syncGuards: { isSyncRunInProgress: () => false, activeSyncPreviewCount: () => 0 },
        } as unknown as ApplicationMenuDeps;
        const { rebuildApplicationMenu } = createApplicationMenu(deps);
        const imageMenu = () => {
            const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0];
            return template.find(item => item.label === 'Image');
        };
        rebuildApplicationMenu();
        expect(imageMenu()).toBeUndefined();
        viewerOpen = true;
        rebuildApplicationMenu();
        const item = (imageMenu()!.submenu as Electron.MenuItemConstructorOptions[])[0];
        expect(item.label).toBe('Find Similar Images');
        expect(item.enabled).toBe(true);
        item.click!({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as Electron.KeyboardEvent);
        expect(send).toHaveBeenCalledWith('find-similar-images');
        folderMode = true;
        rebuildApplicationMenu();
        expect((imageMenu()!.submenu as Electron.MenuItemConstructorOptions[])[0].enabled).toBe(false);
        viewerOpen = false;
        rebuildApplicationMenu();
        expect(imageMenu()).toBeUndefined();
    });
});

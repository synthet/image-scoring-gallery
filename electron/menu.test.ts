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
            getBackendStatus: () => ({ status: 'connected', url: 'http://127.0.0.1:7860', lastCheckedAt: null, error: null }),
            isLocalSimilarityAvailable: () => false,
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

describe('Tools menu backend items', () => {
    function build(status: 'connected' | 'disconnected' | 'checking', localSimilarity = false) {
        const reconnectBackend = vi.fn();
        const deps = {
            getMainWindow: () => ({ webContents: { send: vi.fn() } }),
            getGalleryMode: () => 'db',
            getIsSingleImageViewOpen: () => true,
            getIsBackupRunning: () => false,
            getExportContext: () => null,
            getSelectionPath: () => null,
            getShowBoundingBox: () => false,
            getShowEyes: () => false,
            getShowFocusPoint: () => true,
            getBackendStatus: () => ({ status, url: 'http://127.0.0.1:7860', lastCheckedAt: null, error: null }),
            reconnectBackend,
            isLocalSimilarityAvailable: () => localSimilarity,
            syncGuards: { isSyncRunInProgress: () => false, activeSyncPreviewCount: () => 0 },
        } as unknown as ApplicationMenuDeps;
        createApplicationMenu(deps).rebuildApplicationMenu();
        const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0];
        const sub = (label: string) => template.find(item => item.label === label)!.submenu as Electron.MenuItemConstructorOptions[];
        const find = (menu: string, label: string) => sub(menu).find(item => item.label === label);
        return { find, sub, reconnectBackend };
    }

    it('shows status, reconnects, and enables backend items when connected', () => {
        const { find, sub, reconnectBackend } = build('connected');
        expect(sub('Tools').find(i => i.id === 'backend-status')!.label).toBe('Backend: Connected (http://127.0.0.1:7860)');
        expect(find('Tools', 'Scoring...')!.enabled).toBe(true);
        const reconnect = find('Tools', 'Reconnect to Backend')!;
        expect(reconnect.enabled).toBe(true);
        reconnect.click!({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as Electron.KeyboardEvent);
        expect(reconnectBackend).toHaveBeenCalledTimes(1);
    });

    it('disables backend-only items when disconnected', () => {
        const { find, sub } = build('disconnected');
        expect(sub('Tools').find(i => i.id === 'backend-status')!.label).toBe('Backend: Not connected');
        expect(find('Tools', 'Scoring...')!.enabled).toBe(false);
        expect(find('Tools', 'Connect to Backend')!.enabled).toBe(true);
        expect(find('Image', 'Find Similar Images')!.enabled).toBe(false);
    });

    it('keeps Find Similar enabled offline when similarity runs locally', () => {
        expect(build('disconnected', true).find('Image', 'Find Similar Images')!.enabled).toBe(true);
    });

    it('disables the connect item while a check is running', () => {
        expect(build('checking').find('Tools', 'Connect to Backend')!.enabled).toBe(false);
    });
});


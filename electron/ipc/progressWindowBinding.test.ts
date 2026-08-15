import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: { getPath: () => '/tmp/userData' },
    BrowserWindow: class {},
    dialog: {},
    ipcMain: { handle: vi.fn() },
}));

import { registerBackupHandlers } from './registerBackupHandlers';
import { registerSyncHandlers } from './registerSyncHandlers';

/**
 * Regression guard for the "Backup stuck on Scanning / Starting…" freeze.
 *
 * Handlers are registered from startFullApplication() *before* createWindow(), so
 * `const mainWindow = getMainWindow()` at registration time captures null forever and
 * every progress event is silently dropped. The window must be resolved per send.
 */
describe('progress handlers resolve the window lazily', () => {
    function fakeIpcMain() {
        const handlers = new Map<string, (...args: unknown[]) => unknown>();
        return {
            ipcMain: {
                handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
                    handlers.set(channel, fn);
                },
            },
            handlers,
        };
    }

    const syncGuards = {
        isSyncRunInProgress: () => false,
        activeSyncPreviewCount: () => 0,
        beginSyncPreview: () => {},
        endSyncPreview: () => {},
        beginSyncRun: () => {},
        endSyncRun: () => {},
    };

    it('registerBackupHandlers does not resolve the window at registration time', () => {
        const { ipcMain, handlers } = fakeIpcMain();
        const getMainWindow = vi.fn(() => null);

        registerBackupHandlers({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ipcMain: ipcMain as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            syncGuards: syncGuards as any,
            getMainWindow,
            getIsBackupRunning: () => false,
            setIsBackupRunning: () => {},
            rebuildApplicationMenu: () => {},
            electronDirname: '/tmp',
            normalizeCameraModel: (raw) => String(raw ?? ''),
            isUnresolvedSyncLayout: () => false,
        });

        expect(handlers.has('backup:run')).toBe(true);
        expect(getMainWindow).not.toHaveBeenCalled();
    });

    it('registerSyncHandlers does not resolve the window at registration time', () => {
        const { ipcMain, handlers } = fakeIpcMain();
        const getMainWindow = vi.fn(() => null);

        registerSyncHandlers({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ipcMain: ipcMain as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exiftool: {} as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            apiService: {} as any,
            loadConfig: () => ({}),
            getMainWindow,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            syncGuards: syncGuards as any,
            rebuildApplicationMenu: () => {},
            isUnresolvedSyncLayout: () => false,
        });

        expect(handlers.size).toBeGreaterThan(0);
        expect(getMainWindow).not.toHaveBeenCalled();
    });
});

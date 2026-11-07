import path from 'node:path';
import type { IpcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { showItemInFolder: vi.fn() } }));

import { registerAppHandlers, type AppHandlersDeps } from './registerAppHandlers';

describe('app:set-selection-path', () => {
    const setSelectionPath = vi.fn();
    const rebuildApplicationMenu = vi.fn();
    let setPath: (filePath: unknown) => Promise<unknown>;

    beforeEach(() => {
        vi.clearAllMocks();
        const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
        const ipcMain = { handle: (channel: string, fn: never) => handlers.set(channel, fn) } as unknown as IpcMain;
        registerAppHandlers({ ipcMain, setSelectionPath, rebuildApplicationMenu } as unknown as AppHandlersDeps);
        setPath = (filePath) => handlers.get('app:set-selection-path')!({}, filePath);
    });

    it.each([
        ['a WSL path from the database', '/mnt/d/Photos/2026'],
        ['an absolute local path', path.resolve('Photos', '2026')],
        ['null, which clears the selection', null],
    ])('stores %s', async (_name, value) => {
        await expect(setPath(value)).resolves.toBe(true);
        expect(setSelectionPath).toHaveBeenCalledWith(value);
        expect(rebuildApplicationMenu).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['a relative path', 'Photos/2026'],
        ['a parent traversal', '../secrets'],
        ['an empty string', ''],
        ['a non-string', 42],
        ['undefined', undefined],
    ])('rejects %s and keeps the current selection', async (_name, value) => {
        await expect(setPath(value)).rejects.toThrow('absolute');
        expect(setSelectionPath).not.toHaveBeenCalled();
        expect(rebuildApplicationMenu).not.toHaveBeenCalled();
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';

const { showOpenDialog, exportOriginals } = vi.hoisted(() => ({ showOpenDialog: vi.fn(), exportOriginals: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showOpenDialog } }));
vi.mock('../exportOriginals', () => ({ exportOriginals }));

import { registerExportHandlers } from './registerExportHandlers';

type Envelope = { ok: boolean; data?: unknown; error?: { message: string } };

describe('registerExportHandlers (#239)', () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<Envelope>>();
    const invoke = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
    const done = { total: 1, copied: 1, failed: [], cancelled: false };

    beforeEach(() => {
        handlers.clear();
        vi.clearAllMocks();
        showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/out'] });
        exportOriginals.mockResolvedValue(done);
        registerExportHandlers({
            ipcMain: { handle: (channel: string, fn: never) => handlers.set(channel, fn) } as unknown as IpcMain,
            getMainWindow: () => null,
            isGalleryFile: async () => true,
        });
    });

    it('rejects anything but a list of paths', async () => {
        for (const bad of [undefined, [], 'a.nef', [1]]) {
            expect((await invoke('export:originals', bad)).ok).toBe(false);
        }
        expect(showOpenDialog).not.toHaveBeenCalled();
    });

    it('copies nothing when the folder dialog is cancelled', async () => {
        showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
        expect(await invoke('export:originals', ['a.nef'])).toMatchObject({ ok: true, data: null });
        expect(exportOriginals).not.toHaveBeenCalled();
    });

    it('allows one export at a time, and another once it finishes', async () => {
        let finish: (r: typeof done) => void = () => undefined;
        exportOriginals.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const first = invoke('export:originals', ['a.nef']);
        await vi.waitFor(() => expect(exportOriginals).toHaveBeenCalled());

        expect(await invoke('export:originals', ['b.nef'])).toMatchObject({ ok: false });
        finish(done);
        await first;
        expect((await invoke('export:originals', ['b.nef'])).ok).toBe(true);
    });

    it('cancel aborts the running export and reports when none is running', async () => {
        expect(await invoke('export:originals-cancel')).toMatchObject({ ok: true, data: false });

        let finish: (r: typeof done) => void = () => undefined;
        exportOriginals.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
        const run = invoke('export:originals', ['a.nef']);
        await vi.waitFor(() => expect(exportOriginals).toHaveBeenCalled());

        expect(await invoke('export:originals-cancel')).toMatchObject({ ok: true, data: true });
        expect((exportOriginals.mock.calls[0][2] as { signal: AbortSignal }).signal.aborted).toBe(true);
        finish(done);
        await run;
    });

    it.runIf(process.platform === 'win32')('turns a WSL path from the database into a Windows path', async () => {
        await invoke('export:originals', ['/mnt/d/Photos/a.nef']);
        expect(exportOriginals.mock.calls[0][0]).toEqual(['d:\\Photos\\a.nef']);
    });
});

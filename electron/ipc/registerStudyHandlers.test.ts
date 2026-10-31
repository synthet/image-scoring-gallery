import { describe, expect, it, vi } from 'vitest';

const showOpenDialog = vi.fn();
vi.mock('electron', () => ({
    BrowserWindow: { getFocusedWindow: () => null },
    dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) },
}));
vi.mock('../db', () => ({ getFolderImageFlags: vi.fn(), getImagesByStack: vi.fn() }));

import { REPRESENTATIVE_PREVIEW_SCHEMA } from '../representativePreview';
import { loadRepresentativePreview, MAX_MANIFEST_BYTES, registerStudyHandlers } from './registerStudyHandlers';

const manifest = {
    schema: REPRESENTATIVE_PREVIEW_SCHEMA,
    shoot: { key: 's' },
    frames: [1, 2].map((id) => ({ key: `k${id}`, image_id: id, flags_at_freeze: { rating: 1, label: null, pick_status: 0 } })),
    groups: [{ representative: 'k1', members: ['k1', 'k2'] }],
    singletons: [],
    always_visible: [],
};
const flags = [1, 2].map((id) => ({ id, rating: 1, label: null, pick_status: 0 }));

function deps(text: string, rows: unknown[] = [{ id: 1 }, { id: 2 }]) {
    return {
        readFile: vi.fn().mockResolvedValue(Buffer.from(text)),
        getFolderImageFlags: vi.fn().mockResolvedValue(flags),
        getFolderImages: vi.fn().mockResolvedValue(rows),
    };
}

describe('loadRepresentativePreview', () => {
    it('returns cards and the folder rows for a matching manifest, with its sha256', async () => {
        const d = deps(JSON.stringify(manifest));
        const result = await loadRepresentativePreview('m.json', 7, d);
        expect(result.preview).toMatchObject({ status: 'ok', cards: [{ representativeId: 1, memberIds: [1, 2] }] });
        expect(result.preview.status === 'ok' && result.preview.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(result.images).toHaveLength(2);
        expect(d.getFolderImageFlags).toHaveBeenCalledWith(7);
        expect(d.getFolderImages).toHaveBeenCalledWith(7, 3);
    });

    it('falls back on unreadable JSON, an oversized file, or rows that changed while loading', async () => {
        expect((await loadRepresentativePreview('m.json', 7, deps('{not json'))).preview).toMatchObject({ reason: 'unreadable' });
        const big = deps('');
        big.readFile.mockResolvedValue(Buffer.alloc(MAX_MANIFEST_BYTES + 1));
        expect((await loadRepresentativePreview('m.json', 7, big)).preview).toMatchObject({ reason: 'unreadable' });
        const drifted = await loadRepresentativePreview('m.json', 7, deps(JSON.stringify(manifest), [{ id: 1 }]));
        expect(drifted).toEqual({ preview: expect.objectContaining({ reason: 'stale_membership' }), images: [] });
    });
});

describe('study:load-representative-preview', () => {
    function register() {
        const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
        registerStudyHandlers({
            ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, fn) } as never,
            getMainWindow: () => null,
        });
        return handlers.get('study:load-representative-preview')!;
    }

    it('opens a JSON file picker and reports a cancelled pick as a fallback', async () => {
        showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
        const result = await register()({}, 7);
        expect(showOpenDialog.mock.calls[0][1]).toMatchObject({ properties: ['openFile'] });
        expect(result).toEqual({ ok: true, data: { preview: expect.objectContaining({ reason: 'cancelled' }), images: [] } });
    });

    it('refuses a missing folder id without opening a dialog', async () => {
        showOpenDialog.mockClear();
        const result = await register()({}, undefined);
        expect(result).toMatchObject({ ok: false });
        expect(showOpenDialog).not.toHaveBeenCalled();
    });
});

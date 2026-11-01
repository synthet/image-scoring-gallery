import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';

const dbMock = vi.hoisted(() => ({
    isDirectPostgresEngine: vi.fn(() => true),
    searchSimilarByStoredEmbedding: vi.fn(),
    getFolderPathById: vi.fn(),
    updateImagePickStatus: vi.fn(),
}));
vi.mock('../db', () => dbMock);
vi.mock('../scoringModels', () => ({ resolveSortOptions: vi.fn() }));

import { registerDbHandlers } from './registerDbHandlers';
import { registerApiHandlers } from './registerApiHandlers';
import type { ApiService } from '../apiService';
import type { BackendConnectionMonitor } from '../backendConnection';

type Handler = (...args: unknown[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
type Status = 'connected' | 'disconnected';

function setup(status: Status = 'connected') {
    const handlers = new Map<string, Handler>();
    const ipcMain = { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain;
    let backendStatus: Status = status;
    const api = {
        searchSimilar: vi.fn().mockResolvedValue({ query_image_id: 1, results: [], count: 0, from: 'api' }),
        updateImagePickStatus: vi.fn().mockResolvedValue({ success: true, from: 'api' }),
    };
    const apiService = api as unknown as ApiService;
    const backendConnection = { getState: () => ({ status: backendStatus }) } as unknown as BackendConnectionMonitor;
    registerDbHandlers({ ipcMain, apiService });
    registerApiHandlers({ ipcMain, apiService, electronDirname: __dirname, backendConnection });
    return { handlers, api, setStatus: (s: Status) => { backendStatus = s; } };
}

beforeEach(() => {
    vi.clearAllMocks();
    dbMock.isDirectPostgresEngine.mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('local-first similarity search', () => {
    it('answers from stored embeddings without calling the backend', async () => {
        const { handlers, api } = setup();
        const local = { query_image_id: 1, results: [{ image_id: 2, file_path: '/a', similarity: 0.9 }], count: 1 };
        dbMock.searchSimilarByStoredEmbedding.mockResolvedValue({ status: 'ok', result: local });
        const res = await handlers.get('api:similarity:search')!(null, { imageId: 1, folderId: 3 });
        expect(res).toEqual({ ok: true, data: local });
        expect(dbMock.searchSimilarByStoredEmbedding).toHaveBeenCalledWith(1, expect.objectContaining({ folderId: 3 }));
        expect(api.searchSimilar).not.toHaveBeenCalled();
    });

    it('falls back to the backend when the image has no stored embedding', async () => {
        const { handlers, api } = setup();
        dbMock.searchSimilarByStoredEmbedding.mockResolvedValue({ status: 'no-embedding' });
        const res = await handlers.get('api:similarity:search')!(null, { imageId: 1 });
        expect(res.data).toMatchObject({ from: 'api' });
        expect(api.searchSimilar).toHaveBeenCalledTimes(1);
    });

    it('explains the missing embedding when the backend is also unreachable', async () => {
        const { handlers, api } = setup();
        dbMock.searchSimilarByStoredEmbedding.mockResolvedValue({ status: 'no-embedding' });
        api.searchSimilar.mockRejectedValue(new TypeError('fetch failed'));
        const res = await handlers.get('api:similarity:search')!(null, { imageId: 1 });
        expect(res.ok).toBe(false);
        expect(res.error).toContain('no stored embedding');
    });

    it('uses only the backend in api engine mode', async () => {
        dbMock.isDirectPostgresEngine.mockReturnValue(false);
        const { handlers, api } = setup();
        await handlers.get('api:similarity:search')!(null, { imageId: 1 });
        expect(dbMock.searchSimilarByStoredEmbedding).not.toHaveBeenCalled();
        expect(api.searchSimilar).toHaveBeenCalledTimes(1);
    });
});

describe('pick status with backend fallback', () => {
    beforeEach(() => {
        dbMock.updateImagePickStatus.mockResolvedValue({ success: true, from: 'db' });
    });

    it('uses the backend while connected (it writes the audit row)', async () => {
        const { handlers, api } = setup('connected');
        const res = await handlers.get('api:update-image-pick-status')!(null, 5, 0);
        expect(res.data).toMatchObject({ from: 'api' });
        expect(api.updateImagePickStatus).toHaveBeenCalledWith(5, 0);
        expect(dbMock.updateImagePickStatus).not.toHaveBeenCalled();
    });

    it('writes locally while the backend is down', async () => {
        const { handlers, api } = setup('disconnected');
        const res = await handlers.get('api:update-image-pick-status')!(null, 5, 1);
        expect(res.data).toMatchObject({ from: 'db' });
        expect(api.updateImagePickStatus).not.toHaveBeenCalled();
    });

    it('falls back locally when the request finds the backend gone', async () => {
        const { handlers, api, setStatus } = setup('connected');
        api.updateImagePickStatus.mockImplementation(async () => {
            setStatus('disconnected');
            throw new TypeError('fetch failed');
        });
        const res = await handlers.get('api:update-image-pick-status')!(null, 5, -1);
        expect(res.data).toMatchObject({ from: 'db' });
    });

    it('surfaces backend HTTP errors instead of writing locally', async () => {
        const { handlers, api } = setup('connected');
        api.updateImagePickStatus.mockRejectedValue(new Error('HTTP 404'));
        const res = await handlers.get('api:update-image-pick-status')!(null, 5, 0);
        expect(res).toMatchObject({ ok: false, error: 'HTTP 404' });
        expect(dbMock.updateImagePickStatus).not.toHaveBeenCalled();
    });
});

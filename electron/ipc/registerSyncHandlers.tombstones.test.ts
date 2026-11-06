import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, sessionStore } = vi.hoisted(() => ({
    dbMock: {
        getDeletedImageKeys: vi.fn(),
        findImageByUuid: vi.fn(),
        findImageByFilePath: vi.fn(),
        normalizePathForDb: vi.fn((p: string) => p.replace(/\\/g, '/')),
        getMaxIndexedCaptureDateUnderDestRoot: vi.fn(),
        getMaxIndexedCreatedDateUnderDestRoot: vi.fn(),
    },
    sessionStore: { read: vi.fn(), write: vi.fn() },
}));

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../db', () => dbMock);
vi.mock('../driveIdentity', () => ({ resolveDriveId: vi.fn(async () => ({ driveId: 'card', source: 'test' })) }));
vi.mock('../driveSessionStore', async (original) => ({
    ...(await original<typeof import('../driveSessionStore')>()),
    getDriveSessionStore: () => sessionStore,
}));

import { registerSyncHandlers } from './registerSyncHandlers';

const KEY = 'NIKON Z 8|12345|2026-01-19T14:56:04';
const TAGS = {
    DateTimeOriginal: '2026:01:19 14:56:04',
    Model: 'NIKON Z 8',
    LensModel: 'NIKKOR Z 180-600mm f/5.6-6.3 VR',
    ShutterCount: 12345,
};

type SyncResult = { skipped: number; wouldCopy: number; copied: number; candidates: Array<{ captureKey?: string | null }> };
type Handler = (event: unknown, ...args: unknown[]) => Promise<{ ok: boolean; data: SyncResult; error?: string }>;

describe('Sync tombstones', () => {
    let root: string;
    let source: string;
    let dest: string;
    let file: string;
    let read: ReturnType<typeof vi.fn>;
    const handlers = new Map<string, Handler>();

    const keys = (over: Partial<{ uuidNameKeys: Set<string>; originalPaths: Set<string>; captureKeys: Set<string> }> = {}) => ({
        uuidNameKeys: new Set<string>(),
        originalPaths: new Set<string>(),
        captureKeys: new Set<string>(),
        ...over,
    });
    const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
    const destFiles = () => (fs.existsSync(dest) ? fs.readdirSync(dest, { recursive: true }) : []);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-tombstones-'));
        source = path.join(root, 'card');
        dest = path.join(root, 'moved-library');
        fs.mkdirSync(source);
        file = path.join(source, 'DSC_1.NEF');
        fs.writeFileSync(file, 'raw');

        dbMock.getDeletedImageKeys.mockResolvedValue(keys());
        dbMock.findImageByUuid.mockResolvedValue(null);
        dbMock.findImageByFilePath.mockResolvedValue(null);
        dbMock.getMaxIndexedCaptureDateUnderDestRoot.mockResolvedValue(null);
        dbMock.getMaxIndexedCreatedDateUnderDestRoot.mockResolvedValue(null);
        sessionStore.read.mockResolvedValue(null);
        sessionStore.write.mockResolvedValue(undefined);
        read = vi.fn(async () => TAGS);

        handlers.clear();
        registerSyncHandlers({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ipcMain: { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exiftool: { read } as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            apiService: {} as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            loadConfig: () => ({ sync: { destinationRoot: dest } }) as any,
            getMainWindow: () => null,
            syncGuards: {
                isBackupRunning: () => false,
                isSyncRunInProgress: () => false,
                activeSyncPreviewCount: () => 0,
                setSyncRunInProgress: vi.fn(),
                incrementPreviewCount: vi.fn(),
                decrementPreviewCount: vi.fn(),
            },
            rebuildApplicationMenu: () => {},
            isUnresolvedSyncLayout: () => false,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('skips a tombstoned frame when the destination root has moved', async () => {
        dbMock.getDeletedImageKeys.mockResolvedValue(
            keys({ originalPaths: new Set(['/mnt/d/Photos/Z8/180-600mm/2026/2026-01-19/DSC_1.NEF']), captureKeys: new Set([KEY]) }),
        );
        const out = await call('sync:preview', source);
        expect(out.ok).toBe(true);
        expect(out.data).toMatchObject({ skipped: 1, wouldCopy: 0, candidates: [] });
    });

    it('skips a tombstoned frame when its lens folder has been renamed', async () => {
        const oldLensPath = `${dest.replace(/\\/g, '/')}/Z8/old-lens-folder/2026/2026-01-19/DSC_1.NEF`;
        dbMock.getDeletedImageKeys.mockResolvedValue(keys({ originalPaths: new Set([oldLensPath]), captureKeys: new Set([KEY]) }));
        const out = await call('sync:preview', source);
        expect(out.data).toMatchObject({ skipped: 1, wouldCopy: 0 });
    });

    it('still copies a new frame with a different capture key', async () => {
        dbMock.getDeletedImageKeys.mockResolvedValue(keys({ captureKeys: new Set(['NIKON Z 8|99999|2026-01-19T14:56:04']) }));
        const out = await call('sync:preview', source);
        expect(out.data).toMatchObject({ skipped: 0, wouldCopy: 1 });
        expect(out.data.candidates[0].captureKey).toBe(KEY);
    });

    it('keeps the existing path route for a tombstone with no capture key', async () => {
        const destFile = path.join(dest, 'Z8', '180-600mm', '2026', '2026-01-19', 'DSC_1.NEF');
        dbMock.getDeletedImageKeys.mockResolvedValue(keys({ originalPaths: new Set([destFile.replace(/\\/g, '/')]) }));
        const out = await call('sync:preview', source);
        expect(out.data).toMatchObject({ skipped: 1, wouldCopy: 0 });
    });

    it('keeps the existing uuid route', async () => {
        read.mockResolvedValue({ ...TAGS, ImageUniqueID: 'abc' });
        dbMock.getDeletedImageKeys.mockResolvedValue(keys({ uuidNameKeys: new Set(['abc dsc_1.nef']) }));
        const out = await call('sync:preview', source);
        expect(out.data).toMatchObject({ skipped: 1, wouldCopy: 0 });
    });

    const session = (entry: Record<string, unknown>) => {
        const st = fs.statSync(file);
        return { driveId: 'card', updatedAt: '2026-01-01', sync: { lastSourceRoot: source, seen: { [`DSC_1.NEF|${st.size}|${st.mtimeMs}`]: entry } } };
    };
    const cached = { dateStr: '2026-01-19', camera: 'Z8', lens: '180-600mm', imageUuid: null };

    it('re-reads EXIF for a cached entry written before capture keys existed', async () => {
        sessionStore.read.mockResolvedValue(session(cached));
        dbMock.getDeletedImageKeys.mockResolvedValue(keys({ captureKeys: new Set([KEY]) }));
        const out = await call('sync:preview', source);
        expect(read).toHaveBeenCalledTimes(1);
        expect(out.data).toMatchObject({ skipped: 1, wouldCopy: 0 });
    });

    it('uses a cached capture key without reading EXIF', async () => {
        sessionStore.read.mockResolvedValue(session({ ...cached, captureKey: KEY }));
        dbMock.getDeletedImageKeys.mockResolvedValue(keys({ captureKeys: new Set([KEY]) }));
        const out = await call('sync:preview', source);
        expect(read).not.toHaveBeenCalled();
        expect(out.data).toMatchObject({ skipped: 1, wouldCopy: 0 });
    });

    it('treats a cached null key as known and does not read EXIF again', async () => {
        sessionStore.read.mockResolvedValue(session({ ...cached, captureKey: null }));
        const out = await call('sync:preview', source);
        expect(read).not.toHaveBeenCalled();
        expect(out.data).toMatchObject({ wouldCopy: 1 });
    });

    it('checks the capture key on a picked candidate', async () => {
        dbMock.getDeletedImageKeys.mockResolvedValue(keys({ captureKeys: new Set([KEY]) }));
        const candidate = { sourcePath: file, fileName: 'DSC_1.NEF', dateStr: '2026-01-19', camera: 'Z8', lens: '180-600mm', imageUuid: null, captureKey: KEY };
        const out = await call('sync:run', source, [candidate]);
        expect(out.data).toMatchObject({ copied: 0, skipped: 1 });
        expect(destFiles()).toEqual([]);
    });

    it('reports an error and copies nothing when tombstones cannot be read', async () => {
        dbMock.getDeletedImageKeys.mockRejectedValue(new Error('connection lost'));
        const out = await call('sync:run', source);
        expect(out.ok).toBe(false);
        expect(out.error).toContain('connection lost');
        expect(destFiles()).toEqual([]);
    });
});

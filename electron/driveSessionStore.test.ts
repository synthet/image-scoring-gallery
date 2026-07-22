import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    reconcileSessions,
    createDriveSessionStore,
    createLocalFileLayer,
    type DriveSession,
    type LayerAdapter,
} from './driveSessionStore';

function session(driveId: string, updatedAt: string, seen: Record<string, string>): DriveSession {
    return {
        driveId,
        updatedAt,
        sync: {
            lastSourceRoot: 'E:\\',
            seen: Object.fromEntries(
                Object.entries(seen).map(([k, dateStr]) => [k, { dateStr, camera: 'Z8', lens: '105mm', imageUuid: null }]),
            ),
        },
    };
}

describe('reconcileSessions', () => {
    it('returns null when nothing present', () => {
        expect(reconcileSessions([null, null])).toBeNull();
    });

    it('picks the newest record as base and unions seen (newest wins on conflict)', () => {
        const older = session('D1', '2026-07-01T00:00:00.000Z', { 'a|1|1': '2026-07-01', 'shared|9|9': '2026-06-30' });
        const newer = session('D1', '2026-07-10T00:00:00.000Z', { 'b|2|2': '2026-07-10', 'shared|9|9': '2026-07-10' });
        const merged = reconcileSessions([older, newer])!;
        expect(merged.updatedAt).toBe('2026-07-10T00:00:00.000Z');
        expect(Object.keys(merged.sync!.seen).sort()).toEqual(['a|1|1', 'b|2|2', 'shared|9|9']);
        // Conflict resolves to the newer record's value.
        expect(merged.sync!.seen['shared|9|9'].dateStr).toBe('2026-07-10');
    });
});

describe('createDriveSessionStore', () => {
    it('reconciles reads across layers and tolerates a failing layer', async () => {
        const good: LayerAdapter = {
            name: 'good',
            read: async () => session('D1', '2026-07-05T00:00:00.000Z', { 'a|1|1': '2026-07-05' }),
            write: async () => {},
        };
        const broken: LayerAdapter = {
            name: 'broken',
            read: async () => {
                throw new Error('offline');
            },
            write: async () => {
                throw new Error('offline');
            },
        };
        const store = createDriveSessionStore([good, broken]);
        const out = await store.read('D1');
        expect(out?.sync?.seen['a|1|1'].dateStr).toBe('2026-07-05');
    });

    it('stamps updatedAt and writes through every reachable layer', async () => {
        const writes: Record<string, DriveSession> = {};
        const layerA: LayerAdapter = {
            name: 'a',
            read: async () => null,
            write: async (_id, s) => {
                writes.a = s;
            },
        };
        const layerB: LayerAdapter = {
            name: 'b',
            read: async () => null,
            write: async (_id, s) => {
                writes.b = s;
            },
        };
        const failing: LayerAdapter = {
            name: 'fail',
            read: async () => null,
            write: async () => {
                throw new Error('nope');
            },
        };
        const store = createDriveSessionStore([layerA, layerB, failing]);
        const before = Date.now();
        const stamped = await store.write(session('D1', '2000-01-01T00:00:00.000Z', { 'a|1|1': '2026-07-05' }));
        expect(new Date(stamped.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
        expect(writes.a.updatedAt).toBe(stamped.updatedAt);
        expect(writes.b.updatedAt).toBe(stamped.updatedAt);
    });
});

describe('createLocalFileLayer', () => {
    let dir: string;
    let file: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-session-'));
        file = path.join(dir, 'nested', 'drive-sessions.json');
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('round-trips a record and returns null for unknown ids', async () => {
        const layer = createLocalFileLayer(file);
        expect(await layer.read('D1')).toBeNull();
        await layer.write('D1', session('D1', '2026-07-05T00:00:00.000Z', { 'a|1|1': '2026-07-05' }));
        const back = await layer.read('D1');
        expect(back?.sync?.seen['a|1|1'].dateStr).toBe('2026-07-05');
        expect(await layer.read('D2')).toBeNull();
    });

    it('keeps multiple drives in one file', async () => {
        const layer = createLocalFileLayer(file);
        await layer.write('D1', session('D1', '2026-07-05T00:00:00.000Z', { 'a|1|1': '2026-07-05' }));
        await layer.write('D2', session('D2', '2026-07-06T00:00:00.000Z', { 'b|2|2': '2026-07-06' }));
        expect((await layer.read('D1'))?.driveId).toBe('D1');
        expect((await layer.read('D2'))?.driveId).toBe('D2');
    });

    it('recovers from a corrupt file by treating it as empty', async () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, '{ not json');
        const layer = createLocalFileLayer(file);
        expect(await layer.read('D1')).toBeNull();
        await layer.write('D1', session('D1', '2026-07-05T00:00:00.000Z', { 'a|1|1': '2026-07-05' }));
        expect((await layer.read('D1'))?.driveId).toBe('D1');
    });
});

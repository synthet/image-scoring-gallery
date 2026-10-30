import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, txQueryMock, settings } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    txQueryMock: vi.fn(),
    settings: {
        database: { engine: 'postgres', api: { url: 'http://127.0.0.1:7860' } },
        localization: { read_normalized_first: false },
    },
}));

vi.mock('./config', () => ({
    getConfigPath: vi.fn(() => '/tmp/config.json'),
    loadAppConfig: vi.fn(() => settings),
}));
vi.mock('./db/provider', () => ({
    createDatabaseConnector: vi.fn(() => ({
        connect: vi.fn(), close: vi.fn(), verifyStartup: vi.fn().mockResolvedValue(true),
        checkConnection: vi.fn().mockResolvedValue(true), query: queryMock,
        runTransaction: vi.fn(async (callback: (tx: typeof txQueryMock) => Promise<unknown>) => callback(txQueryMock)),
    })),
}));

type GalleryDb = typeof import('./db');
const keywordReaders = [
    { name: 'image keyword filter', read: (db: GalleryDb) => db.getImages({ keyword: 'wren' }) },
    { name: 'image count keyword filter', read: (db: GalleryDb) => db.getImageCount({ keyword: 'wren' }) },
    { name: 'stack keyword filters', read: (db: GalleryDb) => db.getStacks({ keyword: 'wren' }) },
    { name: 'image detail keywords', read: (db: GalleryDb) => db.getImageDetails(1) },
    { name: 'species keyword cloud', read: (db: GalleryDb) => db.getKeywordCloud({ kind: 'species' }) },
];

function executedSql(): string {
    return queryMock.mock.calls.map(([text]) => String(text)).join('\n');
}

describe('species keyword freshness in gallery readers', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        queryMock.mockResolvedValue([]);
        txQueryMock.mockResolvedValue([]);
    });

    for (const reader of keywordReaders) {
        it(`${reader.name} reads the protected view when the backend provides it`, async () => {
            queryMock.mockImplementation(async (sql: string) =>
                sql.includes("to_regclass('public.localization_visible_image_keywords')") ? [{ supported: true }] : []);
            const db = await import('./db');
            await reader.read(db);
            expect(executedSql()).toContain('localization_visible_image_keywords ik');
            expect(executedSql()).not.toMatch(/(FROM|JOIN) image_keywords ik/);
        });

        it(`${reader.name} keeps the raw table on schemas without the view`, async () => {
            const db = await import('./db');
            await reader.read(db);
            expect(executedSql()).toMatch(/(FROM|JOIN) image_keywords ik/);
        });
    }

    it('skips the capability probe when no keyword filter applies', async () => {
        const db = await import('./db');
        await db.getImages();
        expect(executedSql()).not.toContain('to_regclass');
    });
});

describe('gallery keyword edits follow the image-lock protocol', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        queryMock.mockResolvedValue([]);
        txQueryMock.mockImplementation(async (sql: string) =>
            sql.startsWith('SELECT keyword_id FROM keywords_dim') ? [{ keyword_id: 7 }] : []);
    });

    it('locks the image before replacing keywords inside one transaction', async () => {
        const db = await import('./db');
        await db.syncImageKeywords(42, 'birds, species:Carolina Wren');
        const statements = txQueryMock.mock.calls.map(([sql]) => String(sql).trim());
        expect(statements[0]).toBe('SELECT id FROM images WHERE id = ? FOR UPDATE');
        expect(statements[1]).toBe('DELETE FROM image_keywords WHERE image_id = ?');
        expect(statements.filter(sql => sql.startsWith('INSERT INTO image_keywords'))).toHaveLength(2);
        expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('image_keywords'), expect.anything());
    });

    it('clears keywords under the same lock when the edit removes them all', async () => {
        const db = await import('./db');
        await db.syncImageKeywords(42, '');
        const statements = txQueryMock.mock.calls.map(([sql]) => String(sql).trim());
        expect(statements).toEqual([
            'SELECT id FROM images WHERE id = ? FOR UPDATE',
            'DELETE FROM image_keywords WHERE image_id = ?',
        ]);
    });

    it('metadata-only updates leave keyword ownership untouched', async () => {
        const db = await import('./db');
        await db.updateImageDetails(42, { rating: 4 });
        expect(txQueryMock).not.toHaveBeenCalled();
    });
});

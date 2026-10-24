import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, settings } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    settings: {
        database: { engine: 'api', api: { url: 'http://127.0.0.1:7860' } },
        localization: { read_normalized_first: false } as { read_normalized_first: boolean } | undefined,
    },
}));

vi.mock('./config', () => ({
    getConfigPath: vi.fn(() => '/tmp/config.json'),
    loadAppConfig: vi.fn(() => settings),
}));
vi.mock('./db/provider', () => ({
    createDatabaseConnector: vi.fn(() => ({
        connect: vi.fn(), close: vi.fn(), verifyStartup: vi.fn().mockResolvedValue(true),
        checkConnection: vi.fn().mockResolvedValue(true), query: queryMock, runTransaction: vi.fn(),
    })),
}));

type GalleryDb = typeof import('./db');
const consumers = [
    { name: 'image list', projections: 1, read: (db: GalleryDb) => db.getImages() },
    { name: 'image detail', projections: 1, read: (db: GalleryDb) => db.getImageDetails(1) },
    { name: 'both stack-card branches', projections: 2, read: (db: GalleryDb) => db.getStacks() },
    { name: 'stack image list', projections: 1, read: (db: GalleryDb) => db.getImagesByStack(1) },
    { name: 'sub-stack image list', projections: 1, read: (db: GalleryDb) => db.getImagesBySubStack(1) },
    { name: 'ungrouped stack image list', projections: 1, read: (db: GalleryDb) => db.getImagesByStackUngrouped(1) },
];

describe.each(['api', 'postgres'])('normalized compatibility reads through %s SQL connector', (engine) => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        settings.database.engine = engine;
        settings.localization = { read_normalized_first: false };
        queryMock.mockResolvedValue([]);
    });

    for (const consumer of consumers) {
        it(`${consumer.name} uses normalized authority when enabled`, async () => {
            settings.localization = { read_normalized_first: true };
            const db = await import('./db');
            await consumer.read(db);
            const sql = queryMock.mock.calls.map(([text]) => String(text)).join('\n');
            expect(sql.match(/FROM image_bird_bbox_compat\b/g)).toHaveLength(consumer.projections);
            expect(sql).not.toContain('i.bird_bbox,');
        });

        it(`${consumer.name} rolls back to the legacy column when disabled`, async () => {
            const db = await import('./db');
            await consumer.read(db);
            const sql = queryMock.mock.calls.map(([text]) => String(text)).join('\n');
            expect(sql).not.toContain('image_bird_bbox_compat');
            expect(sql.match(/i\.bird_bbox,/g)).toHaveLength(consumer.projections);
        });
    }

    it('keeps existing configurations without a localization flag on the legacy path', async () => {
        settings.localization = undefined;
        const db = await import('./db');
        await db.getImages();
        expect(queryMock.mock.calls[0][0]).toContain('i.bird_bbox,');
        expect(queryMock.mock.calls[0][0]).not.toContain('image_bird_bbox_compat');
    });
});

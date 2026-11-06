import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('./config', () => ({
  getConfigPath: vi.fn(() => '/tmp/config.json'),
  loadAppConfig: vi.fn(() => ({
    database: { engine: 'api', api: { url: 'http://127.0.0.1:7860' } },
  })),
}));

vi.mock('./db/provider', () => ({
  createDatabaseConnector: vi.fn(() => ({
    connect: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    verifyStartup: vi.fn().mockResolvedValue(true),
    checkConnection: vi.fn().mockResolvedValue(true),
    query: queryMock,
    runTransaction: vi.fn(),
  })),
}));

import { getDeletedImageKeys } from './db';

describe('db.getDeletedImageKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects from deleted_images', async () => {
    queryMock.mockResolvedValue([]);
    await getDeletedImageKeys();
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('SELECT image_uuid, file_name, original_path, capture_key FROM deleted_images');
  });

  it('builds uuid+filename keys with a lowercased file name', async () => {
    queryMock.mockResolvedValue([
      { image_uuid: 'ABC-123', file_name: 'IMG_0001.NEF', original_path: null },
    ]);

    const { uuidNameKeys } = await getDeletedImageKeys();

    expect(uuidNameKeys.has('ABC-123 img_0001.nef')).toBe(true);
    expect(uuidNameKeys.size).toBe(1);
  });

  it('adds normalized and forward-slash variants of original_path', async () => {
    // WSL-format path passes through normalizePathForDb unchanged on every platform.
    queryMock.mockResolvedValue([
      { image_uuid: null, file_name: null, original_path: '/mnt/d/Photos/IMG_0002.nef' },
    ]);

    const { originalPaths } = await getDeletedImageKeys();

    expect(originalPaths.has('/mnt/d/Photos/IMG_0002.nef')).toBe(true);
  });

  it('skips rows without a usable image_uuid for the uuid+filename set', async () => {
    queryMock.mockResolvedValue([
      { image_uuid: '   ', file_name: 'IMG_0003.nef', original_path: null },
      { image_uuid: null, file_name: 'IMG_0004.nef', original_path: null },
    ]);

    const { uuidNameKeys } = await getDeletedImageKeys();

    expect(uuidNameKeys.size).toBe(0);
  });

  it('collects capture keys and ignores empty ones', async () => {
    queryMock.mockResolvedValue([
      { image_uuid: null, file_name: 'a.NEF', original_path: null, capture_key: 'NIKON Z 8|1|2026-01-19T14:56:04' },
      { image_uuid: null, file_name: 'b.NEF', original_path: null, capture_key: null },
      { image_uuid: null, file_name: 'c.NEF', original_path: null, capture_key: '  ' },
    ]);

    const { captureKeys } = await getDeletedImageKeys();

    expect([...captureKeys]).toEqual(['NIKON Z 8|1|2026-01-19T14:56:04']);
  });

  it('falls back to the older query when the column has not been migrated', async () => {
    queryMock
      .mockRejectedValueOnce(Object.assign(new Error('column "capture_key" does not exist'), { code: '42703' }))
      .mockResolvedValueOnce([{ image_uuid: 'u', file_name: 'a.NEF', original_path: '/mnt/d/a.NEF' }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { uuidNameKeys, originalPaths, captureKeys } = await getDeletedImageKeys();

    expect(queryMock.mock.calls[1][0]).toContain('SELECT image_uuid, file_name, original_path FROM deleted_images');
    expect(uuidNameKeys.has('u a.nef')).toBe(true);
    expect(originalPaths.has('/mnt/d/a.NEF')).toBe(true);
    expect(captureKeys.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('throws when the tombstones cannot be read', async () => {
    queryMock.mockRejectedValueOnce(new Error('connection lost'));

    await expect(getDeletedImageKeys()).rejects.toThrow('connection lost');
  });

  it('throws when the table is missing', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "deleted_images" does not exist'), { code: '42P01' }),
    );

    await expect(getDeletedImageKeys()).rejects.toThrow('does not exist');
  });
});

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
    expect(sql).toContain('SELECT image_uuid, file_name, original_path FROM deleted_images');
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

  it('returns empty sets and warns when the deleted_images query fails', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "deleted_images" does not exist'), { code: '42P01' }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { uuidNameKeys, originalPaths } = await getDeletedImageKeys();

    expect(uuidNameKeys.size).toBe(0);
    expect(originalPaths.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});

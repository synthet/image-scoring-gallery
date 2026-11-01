import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('./config', () => ({
  getConfigPath: vi.fn(() => '/tmp/config.json'),
  loadAppConfig: vi.fn(() => ({
    database: { engine: 'postgres', postgres: { host: 'localhost' } },
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

import { getSearchExampleQueries, isDirectPostgresEngine, searchSimilarByStoredEmbedding, updateImagePickStatus } from './db';

describe('db.searchSimilarByStoredEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the direct postgres engine', () => {
    expect(isDirectPostgresEngine()).toBe(true);
  });

  it('returns no-embedding when the query image has none', async () => {
    queryMock.mockResolvedValueOnce([]);
    await expect(searchSimilarByStoredEmbedding(7)).resolves.toEqual({ status: 'no-embedding' });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('orders by pgvector distance, applies backend defaults, and stops at min similarity', async () => {
    queryMock
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([
        { image_id: 2, file_path: '/mnt/d/a.nef', similarity: '0.9512345678' },
        { image_id: 3, file_path: '/mnt/d/b.nef', similarity: 0.81 },
        { image_id: 4, file_path: '/mnt/d/c.nef', similarity: 0.79 },
        { image_id: 5, file_path: '/mnt/d/d.nef', similarity: 0.85 },
      ]);

    const out = await searchSimilarByStoredEmbedding(7);

    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain('<=> q.embedding');
    expect(sql).toContain('ORDER BY ie.embedding <=> q.embedding');
    expect(sql).not.toContain('i.folder_id = ?');
    expect(params).toEqual([7, 'mobilenet_v2_imagenet_gap', 'mobilenet_v2_imagenet_gap', 7, 20]);
    expect(out).toEqual({
      status: 'ok',
      result: {
        query_image_id: 7,
        results: [
          { image_id: 2, file_path: '/mnt/d/a.nef', similarity: 0.951235 },
          { image_id: 3, file_path: '/mnt/d/b.nef', similarity: 0.81 },
        ],
        count: 2,
      },
    });
  });

  it('scopes to a folder id and clamps the limit', async () => {
    queryMock.mockResolvedValueOnce([{ ok: 1 }]).mockResolvedValueOnce([]);
    await searchSimilarByStoredEmbedding(7, { folderId: 12, limit: 500, minSimilarity: 0.5 });
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain('AND i.folder_id = ?');
    expect(params.slice(-2)).toEqual([12, 100]);
  });

  it('returns an empty result for an unknown folder path, like the backend', async () => {
    queryMock.mockResolvedValueOnce([{ ok: 1 }]).mockResolvedValueOnce([]);
    const out = await searchSimilarByStoredEmbedding(7, { folderPath: '/mnt/d/nowhere' });
    expect(out).toEqual({ status: 'ok', result: { query_image_id: 7, results: [], count: 0 } });
    expect(queryMock.mock.calls[1][0]).toContain('FROM folders WHERE path = ?');
  });
});

describe('db.updateImagePickStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [1, 4, 'Green'],
    [-1, 1, 'Red'],
    [0, 0, ''],
  ] as const)('pick_status %i mirrors to rating %i and label %s like the backend', async (pick, rating, label) => {
    queryMock.mockResolvedValueOnce([{ id: 9 }]);
    const out = await updateImagePickStatus(9, pick);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('UPDATE images SET pick_status = ?, rating = ?, label = ? WHERE id = ?');
    expect(params).toEqual([pick, rating, label, 9]);
    expect(out).toMatchObject({ success: true, data: { image_id: 9, pick_status: pick, rating, label, sidecar_written: false } });
  });

  it('rejects unknown images and invalid values', async () => {
    queryMock.mockResolvedValueOnce([]);
    await expect(updateImagePickStatus(9, 0)).rejects.toThrow('Image not found');
    await expect(updateImagePickStatus(9, 2 as never)).rejects.toThrow('pick_status');
  });
});

describe('db.getSearchExampleQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ranks keywords, prefers display text, dedupes and drops 1-char entries', async () => {
    queryMock.mockResolvedValueOnce([
      { keyword_norm: 'heron', keyword_display: 'Heron' },
      { keyword_norm: 'heron', keyword_display: 'heron' },
      { keyword_norm: 'x', keyword_display: null },
      { keyword_norm: 'sunset', keyword_display: '  ' },
    ]);
    const out = await getSearchExampleQueries();
    expect(out).toEqual({ queries: ['Heron', 'sunset'], source: 'keywords' });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('ORDER BY count DESC');
    expect(params).toEqual([48]);
  });

  it('scopes to a known folder and returns nothing for an unknown one', async () => {
    queryMock.mockResolvedValueOnce([{ id: 4 }]).mockResolvedValueOnce([]);
    await getSearchExampleQueries({ folder_path: '/mnt/d/birds', limit: 10 });
    expect(queryMock.mock.calls[1][0]).toContain('i.folder_id = ?');
    expect(queryMock.mock.calls[1][1]).toEqual([4, 10]);

    queryMock.mockResolvedValueOnce([]);
    await expect(getSearchExampleQueries({ folder_path: '/mnt/d/none' })).resolves.toEqual({ queries: [], source: 'keywords' });
  });
});

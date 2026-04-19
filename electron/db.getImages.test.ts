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

import { getImages } from './db';

describe('db.getImages SQL construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it('uses default sort/pagination and binds limit,offset in that order', async () => {
    await getImages();

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('ORDER BY i.score_general DESC NULLS LAST, i.id DESC');
    expect(sql).toContain('LIMIT ? OFFSET ?');
    expect(params).toEqual([50, 0]);
  });

  it('falls back to whitelisted default sort when sortBy is invalid', async () => {
    await getImages({ sortBy: 'score_general; DROP TABLE images', order: 'ASC' as any });

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('ORDER BY i.score_general ASC, i.id DESC');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('builds filters and applies explicit pagination params', async () => {
    await getImages({
      folderIds: [2, 7],
      minRating: 3,
      colorLabel: 'green',
      keyword: 'bird',
      capturedDate: '2026-04-10',
      sortBy: 'file_name',
      order: 'ASC',
      limit: 25,
      offset: 10,
    });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('folder_id IN (?, ?)');
    expect(sql).toContain('i.rating >= ?');
    expect(sql).toContain('i.label = ?');
    expect(sql).toContain('LOWER(kd.keyword_display) LIKE LOWER(?)');
    expect(sql).toContain('= ?'); // capturedDate filter
    expect(sql).toContain('ORDER BY i.file_name ASC, i.id DESC');

    expect(params).toEqual([
      2,
      7,
      3,
      'green',
      '%bird%',
      '%bird%',
      '2026-04-10',
      25,
      10,
    ]);
  });
});

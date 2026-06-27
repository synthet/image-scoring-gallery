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

import { getImageCount, getImages } from './db';

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

  it('joins image_model_scores when sorting by model:topiq', async () => {
    await getImages({ sortBy: 'model:topiq', order: 'DESC' });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('image_model_scores ims_sort');
    expect(sql).toContain("ims_sort.model_name = 'topiq'");
    expect(sql).toContain('ORDER BY ims_sort.normalized DESC NULLS LAST, i.id DESC');
    expect(sql).toContain('ims_sort.normalized AS model_sort_score');
    expect(params).toEqual([50, 0]);
  });

  it('does not reference dropped images.score_* columns in overlay SELECT', async () => {
    await getImages({ limit: 5, offset: 0 });

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('i.folder_id');
    expect(sql).toContain('ims_legacy.score_spaq AS score_spaq');
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain('WHERE image_id = i.id');
    expect(sql).not.toMatch(/i\.score_spaq\b/);
    expect(sql).not.toMatch(/COALESCE\(i\.score_spaq/);
  });

  it('binds keyword filters before pagination when sorting by model scores', async () => {
    await getImages({ keyword: 'birds', sortBy: 'model:arniqa', order: 'DESC', limit: 8, offset: 0 });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("ims_sort.model_name = 'arniqa'");
    expect(sql).toContain('LOWER(kd.keyword_display) LIKE LOWER(?)');
    expect(params).toEqual(['%birds%', '%birds%', 8, 0]);
  });

  it('uses exact keyword_norm match when keywordExact is true', async () => {
    await getImages({ keyword: 'species:cardinal', keywordExact: true, limit: 10, offset: 0 });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('LOWER(kd.keyword_norm) = LOWER(?)');
    expect(sql).not.toContain('LOWER(kd.keyword_display) LIKE');
    expect(params).toEqual(['species:cardinal', 10, 0]);
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

  it('uses indexed created_at for capture_date sort (display still uses EXIF capture_date)', async () => {
    await getImages({ sortBy: 'capture_date', order: 'DESC', limit: 10, offset: 0 });

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('ORDER BY i.created_at DESC NULLS LAST, i.id DESC');
    expect(sql).not.toMatch(/i\.id DESC DESC/);
    expect(sql).toContain('as capture_date');
  });

  it('applies the CLIP quality threshold to image rows and counts', async () => {
    await getImages({ minClipQualityV0: 0.7, limit: 5, offset: 0 });

    const [listSql, listParams] = queryMock.mock.calls[0];
    expect(listSql).toContain("ims_cq.model_name = 'clip_quality_v0'");
    expect(listSql).toContain('ims_cq.image_id = i.id');
    expect(listSql).toContain('COALESCE(ims_cq.normalized, ims_cq.raw_score) >= ?');
    expect(listParams).toEqual([0.7, 5, 0]);

    queryMock.mockResolvedValueOnce([{ count: 0 }]);
    await getImageCount({ minClipQualityV0: 0.7 });

    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(countSql).toContain('ims_cq.image_id = images.id');
    expect(countParams).toEqual([0.7]);
  });
});

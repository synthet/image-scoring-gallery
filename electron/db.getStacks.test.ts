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

import { getImagesByStackUngrouped, getStacks, getStackCount, getSubstacksForStack } from './db';

describe('db.getStacks keyword filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it('uses normalized image_keywords/keywords_dim in both stack-cache and non-stack branches', async () => {
    await getStacks({ keyword: 'bird' });

    // Skip stack_cache probe call from ensureStackCacheTable; pick the main getStacks SQL.
    const mainCall = queryMock.mock.calls.find(([sql]) => !/SELECT 1 FROM stack_cache WHERE 1=0/.test(sql as string));
    expect(mainCall).toBeDefined();
    const [sql, params] = mainCall!;
    expect(sql).not.toMatch(/\b(i|ci)\.keywords\s+LIKE/i);
    expect(sql).toContain('JOIN image_keywords ik ON ik.image_id = ci.id');
    expect(sql).toContain('WHERE ik.image_id = i.id');
    expect(sql).toContain('LOWER(kd.keyword_display) LIKE LOWER(?)');
    expect(sql).toContain('LOWER(kd.keyword_norm) LIKE LOWER(?)');

    // Two for cache branch + two for non-stack branch.
    const likeParams = (params as unknown[]).filter(p => p === '%bird%');
    expect(likeParams.length).toBe(4);
  });
});

describe('db.getStackCount keyword filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([{ count: 0 }]);
  });

  it('filters via normalized keyword tables and binds two LIKE params', async () => {
    await getStackCount({ keyword: 'bird' });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/\bi\.keywords\s+LIKE/i);
    expect(sql).toContain('SELECT 1 FROM image_keywords ik');
    expect(sql).toContain('JOIN keywords_dim kd ON ik.keyword_id = kd.keyword_id');
    expect(sql).toContain('LOWER(kd.keyword_display) LIKE LOWER(?)');
    expect(sql).toContain('LOWER(kd.keyword_norm) LIKE LOWER(?)');

    expect(params).toEqual(expect.arrayContaining(['%bird%', '%bird%']));
  });
});

describe('db.getSubstacksForStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it('returns display-ready sub-stack cards from filtered members', async () => {
    await getSubstacksForStack(5, {
      minRating: 2,
      colorLabel: 'Red',
      keyword: 'bird',
      capturedDate: '2024-01-02',
    });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('WITH filtered_members AS');
    expect(sql).toContain('FROM sub_stacks ss');
    expect(sql).toContain('JOIN member_counts mc ON mc.sub_stack_id = ss.id');
    expect(sql).toContain('JOIN LATERAL');
    expect(sql).toContain('i.sub_stack_id IS NOT NULL');
    expect(sql).toContain('i.rating >= ?');
    expect(sql).toContain('i.label = ?');
    expect(sql).toContain('FROM image_keywords ik');
    expect(sql).toContain('ss.id AS sub_stack_id');
    expect(sql).toContain('rep.file_path');

    expect(params).toEqual([
      5,
      2,
      'Red',
      '%bird%',
      '%bird%',
      '2024-01-02',
      5,
    ]);
  });

  it('appends an ungrouped card when filtered stack members have no sub-stack assignment', async () => {
    const subStackRow = {
      id: 101,
      sub_stack_id: 12,
      sub_stack_key: 12,
      stack_id: 5,
      name: 'Visual group',
      file_path: '/images/101.jpg',
      file_name: '101.jpg',
      score_general: 0.9,
      score_technical: 0.8,
      score_aesthetic: 0.7,
      score_spaq: 0.6,
      score_ava: 0.5,
      score_liqe: 0.4,
      rating: 3,
      label: null,
      image_count: 2,
      is_ungrouped_sub_stack: false,
    };
    const ungroupedRow = {
      id: 201,
      sub_stack_id: null,
      sub_stack_key: null,
      stack_id: 5,
      name: 'Ungrouped',
      file_path: '/images/201.jpg',
      file_name: '201.jpg',
      score_general: 0.85,
      score_technical: 0.75,
      score_aesthetic: 0.65,
      score_spaq: 0.55,
      score_ava: 0.45,
      score_liqe: 0.35,
      rating: 2,
      label: 'Blue',
      image_count: 1,
      is_ungrouped_sub_stack: true,
    };
    queryMock
      .mockResolvedValueOnce([subStackRow])
      .mockResolvedValueOnce([ungroupedRow]);

    await expect(getSubstacksForStack(5, { minRating: 2, keyword: 'bird' })).resolves.toEqual([
      subStackRow,
      ungroupedRow,
    ]);

    const [subStackSql] = queryMock.mock.calls[0];
    const [ungroupedSql, ungroupedParams] = queryMock.mock.calls[1];
    expect(subStackSql).toContain('i.sub_stack_id IS NOT NULL');
    expect(ungroupedSql).toContain('i.sub_stack_id IS NULL');
    expect(ungroupedSql).toContain("'Ungrouped' AS name");
    expect(ungroupedSql).toContain('TRUE AS is_ungrouped_sub_stack');
    expect(ungroupedParams).toEqual([5, 2, '%bird%', '%bird%', 5]);
  });

  it('falls back to no sub-stacks when the additive schema is absent', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('relation "sub_stacks" does not exist'), { code: '42P01' }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(getSubstacksForStack(5)).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('db.getImagesByStackUngrouped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it('loads only filtered images from the root stack without sub-stack assignment', async () => {
    await getImagesByStackUngrouped(5, {
      minRating: 2,
      colorLabel: 'Blue',
      keyword: 'bird',
      capturedDate: '2024-01-02',
    });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('i.stack_id = ?');
    expect(sql).toContain('i.sub_stack_id IS NULL');
    expect(sql).toContain('i.rating >= ?');
    expect(sql).toContain('i.label = ?');
    expect(sql).toContain('FROM image_keywords ik');
    expect(params).toEqual([
      5,
      2,
      'Blue',
      '%bird%',
      '%bird%',
      '2024-01-02',
      200,
      0,
    ]);
  });
});

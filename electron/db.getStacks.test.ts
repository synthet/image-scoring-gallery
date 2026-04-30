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

import { getStacks, getStackCount } from './db';

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

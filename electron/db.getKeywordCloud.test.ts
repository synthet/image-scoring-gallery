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

import { getKeywordCloud } from './db';

describe('db.getKeywordCloud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it('filters species keywords with LIKE species:%', async () => {
    await getKeywordCloud({ kind: 'species', limit: 10 });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('kd.keyword_norm LIKE ?');
    expect(sql).not.toContain('NOT LIKE');
    expect(params[0]).toBe('species:%');
    expect(params[params.length - 1]).toBe(10);
  });

  it('filters general keywords with NOT LIKE species:%', async () => {
    await getKeywordCloud({ kind: 'general', limit: 5 });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('kd.keyword_norm NOT LIKE ?');
    expect(params[0]).toBe('species:%');
    expect(params[params.length - 1]).toBe(5);
  });

  it('scopes counts to folder when folderId is provided', async () => {
    await getKeywordCloud({ kind: 'general', folderId: 42 });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('JOIN images i ON ik.image_id = i.id');
    expect(sql).toContain('i.folder_id = ?');
    expect(params).toContain(42);
  });

  it('orders by count descending', async () => {
    queryMock.mockResolvedValue([
      { keyword_norm: 'wildlife', keyword_display: 'wildlife', count: 50 },
      { keyword_norm: 'bird', keyword_display: 'bird', count: 10 },
    ]);

    const rows = await getKeywordCloud({ kind: 'general' });
    expect(rows).toEqual([
      { keyword_norm: 'wildlife', keyword_display: 'wildlife', count: 50 },
      { keyword_norm: 'bird', keyword_display: 'bird', count: 10 },
    ]);
  });
});

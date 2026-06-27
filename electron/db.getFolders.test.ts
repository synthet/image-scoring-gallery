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

import { getFolders } from './db';

describe('db.getFolders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it('aggregates image counts with one grouped subquery', async () => {
    await getFolders();

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('GROUP BY folder_id');
    expect(sql).toContain('COALESCE(ic.image_count, 0) AS image_count');
    expect(sql).not.toContain('WHERE i.folder_id = f.id');
  });
});

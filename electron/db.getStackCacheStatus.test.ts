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

import { getStackCacheStatus } from './db';

function mockStackCacheStatusRow(cached: number, expected: number) {
  queryMock.mockImplementation(async (sql: string) => {
    if (/SELECT 1 FROM stack_cache WHERE 1=0/.test(sql)) {
      return [];
    }
    if (/AS cached/.test(sql)) {
      return [{ cached, expected }];
    }
    return [];
  });
}

describe('db.getStackCacheStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([]);
  });

  it('reports stale=false when cached and expected counts match', async () => {
    mockStackCacheStatusRow(120, 120);

    const status = await getStackCacheStatus();

    expect(status).toEqual({ cached: 120, expected: 120, stale: false });
    const statusCall = queryMock.mock.calls.find(([sql]) => /AS cached/.test(sql as string));
    expect(statusCall).toBeDefined();
  });

  it('reports stale=true when cached count is lower than expected', async () => {
    mockStackCacheStatusRow(9758, 9773);

    const status = await getStackCacheStatus();

    expect(status).toEqual({ cached: 9758, expected: 9773, stale: true });
  });

  it('reports stale=true when cached count is higher than expected', async () => {
    mockStackCacheStatusRow(10, 8);

    const status = await getStackCacheStatus();

    expect(status).toEqual({ cached: 10, expected: 8, stale: true });
  });
});

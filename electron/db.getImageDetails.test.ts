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

import { getImageDetails, getImagesByStack, resetSubStackSchemaCacheForTests } from './db';

describe('db.getImageDetails sub-stack schema fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSubStackSchemaCacheForTests();
  });

  it('selects folder_id and uses a per-image LATERAL score overlay', async () => {
    queryMock.mockResolvedValueOnce([{
      id: 42,
      folder_id: 72052,
      file_name: 'test.jpg',
      sub_stack_id: 3,
    }]);

    const result = await getImageDetails(42);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('i.folder_id');
    expect(sql).toContain('i.sub_stack_id');
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain('WHERE image_id = i.id');
    expect(params).toEqual([42]);
    expect(result).toMatchObject({ id: 42, folder_id: 72052, sub_stack_id: 3 });
  });

  it('returns null when the image row is missing', async () => {
    queryMock.mockResolvedValueOnce([]);

    await expect(getImageDetails(999)).resolves.toBeNull();
  });

  it('retries without i.sub_stack_id when the column is missing', async () => {
    const row = {
      id: 177084,
      folder_id: 72052,
      file_name: 'DSC_6246.NEF',
      sub_stack_id: null,
    };

    queryMock
      .mockRejectedValueOnce(Object.assign(new Error('column i.sub_stack_id does not exist'), { code: '42703' }))
      .mockResolvedValueOnce([row]);

    const result = await getImageDetails(177084);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const [retrySql] = queryMock.mock.calls[1];
    expect(retrySql).toContain('CAST(NULL AS INTEGER) AS sub_stack_id');
    expect(retrySql).not.toContain('i.sub_stack_id');
    expect(result).toMatchObject({ id: 177084, folder_id: 72052 });
  });

  it('caches missing sub_stack_id after first 42703 (second call uses one query)', async () => {
    const row = {
      id: 177084,
      folder_id: 72052,
      file_name: 'DSC_6246.NEF',
      sub_stack_id: null,
    };

    queryMock
      .mockRejectedValueOnce(Object.assign(new Error('column i.sub_stack_id does not exist'), { code: '42703' }))
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([row]);

    await getImageDetails(177084);
    await getImageDetails(177085);

    expect(queryMock).toHaveBeenCalledTimes(3);
    const thirdSql = queryMock.mock.calls[2][0] as string;
    expect(thirdSql).toContain('CAST(NULL AS INTEGER) AS sub_stack_id');
    expect(thirdSql).not.toMatch(/\bi\.sub_stack_id\b/);
  });
});

describe('db.getImagesByStack sub-stack schema fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSubStackSchemaCacheForTests();
  });

  it('retries without i.sub_stack_id and still selects folder_id', async () => {
    queryMock
      .mockRejectedValueOnce(Object.assign(new Error('column i.sub_stack_id does not exist'), { code: '42703' }))
      .mockResolvedValueOnce([{ id: 1, folder_id: 9 }]);

    const rows = await getImagesByStack(12);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const [retrySql] = queryMock.mock.calls[1];
    expect(retrySql).toContain('CAST(NULL AS INTEGER) AS sub_stack_id');
    expect(retrySql).not.toMatch(/\bi\.sub_stack_id\b/);
    expect(retrySql).toContain('i.folder_id');
    expect(rows).toEqual([{ id: 1, folder_id: 9 }]);
  });
});

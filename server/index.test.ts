import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import { createServerApp } from './index';

function createDbMock() {
  return {
    checkConnection: vi.fn(),
    getImageCount: vi.fn(),
    getImages: vi.fn(),
    getImageDetails: vi.fn(),
    updateImageDetails: vi.fn(),
    deleteImage: vi.fn(),
    deleteFolder: vi.fn(),
    getFolders: vi.fn(),
    getKeywords: vi.fn(),
    getDatesWithShots: vi.fn(),
    getStacks: vi.fn(),
    getImagesByStack: vi.fn(),
    getStackCount: vi.fn(),
    rebuildStackCache: vi.fn(),
    getFolderPathById: vi.fn(),
  };
}

describe('server /gallery-api contract envelope', () => {
  let server: Server | undefined;
  let baseUrl = '';

  beforeEach(async () => {
    const dbMock = createDbMock();
    dbMock.getImageCount.mockResolvedValue(42);

    const apiServiceMock = {
      findDuplicates: vi.fn(),
      searchSimilar: vi.fn(),
      getOutliers: vi.fn(),
      importRegister: vi.fn(),
    };

    const app = createServerApp({
      dbModule: dbMock as any,
      apiService: apiServiceMock as any,
      configPath: '/tmp/nope.json',
      appConfig: { api: { url: 'http://127.0.0.1:7860' } },
      backendBaseUrl: 'http://127.0.0.1:7860',
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((err) => (err ? reject(err) : resolve()));
    });
    server = undefined;
    baseUrl = '';
  });

  it('returns { ok: true, data } for successful /gallery-api/db/image-count', async () => {
    const res = await fetch(`${baseUrl}/gallery-api/db/image-count?minRating=2`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, data: 42 });
  });

  it('returns { ok: false, error } for thrown route errors', async () => {
    const dbMock = createDbMock();
    dbMock.getImageCount.mockRejectedValue(new Error('count exploded'));

    const app = createServerApp({
      dbModule: dbMock as any,
      apiService: {
        findDuplicates: vi.fn(),
        searchSimilar: vi.fn(),
        getOutliers: vi.fn(),
        importRegister: vi.fn(),
      } as any,
      configPath: '/tmp/nope.json',
      appConfig: {},
      backendBaseUrl: 'http://127.0.0.1:7860',
    });

    const errorServer = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = errorServer.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('invalid server address');
      }
      const res = await fetch(`http://127.0.0.1:${addr.port}/gallery-api/db/image-count`);
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ ok: false, error: 'count exploded' });
    } finally {
      await new Promise<void>((resolve, reject) => errorServer.close((err) => (err ? reject(err) : resolve())));
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import { createServer } from 'http';
import * as db from '../electron/db';
import type { ApiService } from '../electron/apiService';
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
    getImagesByStackUngrouped: vi.fn(),
    getSubstacksForStack: vi.fn(),
    getImagesBySubStack: vi.fn(),
    getStackCount: vi.fn(),
    getStackCacheCount: vi.fn(),
    rebuildStackCache: vi.fn(),
    getFolderPathById: vi.fn(),
  };
}

function createApiServiceMock() {
  return {
    findDuplicates: vi.fn(),
    searchSimilar: vi.fn(),
    getOutliers: vi.fn(),
    importRegister: vi.fn(),
  };
}

function asDbModule(mock: ReturnType<typeof createDbMock>): typeof db {
  return mock as unknown as typeof db;
}

function asApiService(mock: ReturnType<typeof createApiServiceMock>): ApiService {
  return mock as unknown as ApiService;
}

describe('server /gallery-api contract envelope', () => {
  let server: Server | undefined;
  let baseUrl = '';

  it('proxies binary artifacts without text decoding', async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 0, 255, 128, 13, 10]);
    const upstream = createServer((_req, response) => {
      response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, immutable' });
      response.end(bytes);
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Invalid upstream address');
    const app = createServerApp({ dbModule: asDbModule(createDbMock()), apiService: asApiService(createApiServiceMock()),
      appConfig: {}, configPath: '/tmp/nope.json', backendBaseUrl: `http://127.0.0.1:${address.port}` });
    const proxy = await new Promise<Server>(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
    try {
      const target = proxy.address();
      if (!target || typeof target === 'string') throw new Error('Invalid proxy address');
      const response = await fetch(`http://127.0.0.1:${target.port}/gallery-api/backend/images/1/evidence/artifacts/test.png`);
      expect(response.headers.get('content-type')).toContain('image/png');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    } finally {
      await Promise.all([new Promise<void>(resolve => proxy.close(() => resolve())), new Promise<void>(resolve => upstream.close(() => resolve()))]);
    }
  });

  beforeEach(async () => {
    const dbMock = createDbMock();
    dbMock.getImageCount.mockResolvedValue(42);

    const app = createServerApp({
      dbModule: asDbModule(dbMock),
      apiService: asApiService(createApiServiceMock()),
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

  it('returns sub-stack route results in the standard envelope', async () => {
    const dbMock = createDbMock();
    dbMock.getSubstacksForStack.mockResolvedValue([{ sub_stack_id: 12, stack_id: 7, image_count: 3 }]);

    const app = createServerApp({
      dbModule: asDbModule(dbMock),
      apiService: asApiService(createApiServiceMock()),
      configPath: '/tmp/nope.json',
      appConfig: {},
      backendBaseUrl: 'http://127.0.0.1:7860',
    });

    const routeServer = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = routeServer.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('invalid server address');
      }
      const res = await fetch(`http://127.0.0.1:${addr.port}/gallery-api/db/stacks/7/substacks?minRating=2`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        data: [{ sub_stack_id: 12, stack_id: 7, image_count: 3 }],
      });
      expect(dbMock.getSubstacksForStack).toHaveBeenCalledWith(7, { minRating: 2 });
    } finally {
      await new Promise<void>((resolve, reject) => routeServer.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('returns sub-stack images route results in the standard envelope', async () => {
    const dbMock = createDbMock();
    dbMock.getImagesBySubStack.mockResolvedValue([{ id: 31, sub_stack_id: 12 }]);

    const app = createServerApp({
      dbModule: asDbModule(dbMock),
      apiService: asApiService(createApiServiceMock()),
      configPath: '/tmp/nope.json',
      appConfig: {},
      backendBaseUrl: 'http://127.0.0.1:7860',
    });

    const routeServer = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = routeServer.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('invalid server address');
      }
      const res = await fetch(`http://127.0.0.1:${addr.port}/gallery-api/db/substacks/12/images?minRating=2`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        data: [{ id: 31, sub_stack_id: 12 }],
      });
      expect(dbMock.getImagesBySubStack).toHaveBeenCalledWith(12, { minRating: 2 });
    } finally {
      await new Promise<void>((resolve, reject) => routeServer.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('returns ungrouped stack images route results in the standard envelope', async () => {
    const dbMock = createDbMock();
    dbMock.getImagesByStackUngrouped.mockResolvedValue([{ id: 22, stack_id: 7, sub_stack_id: null }]);

    const app = createServerApp({
      dbModule: asDbModule(dbMock),
      apiService: asApiService(createApiServiceMock()),
      configPath: '/tmp/nope.json',
      appConfig: {},
      backendBaseUrl: 'http://127.0.0.1:7860',
    });

    const routeServer = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = routeServer.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('invalid server address');
      }
      const res = await fetch(`http://127.0.0.1:${addr.port}/gallery-api/db/stacks/7/ungrouped-images?minRating=2`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        data: [{ id: 22, stack_id: 7, sub_stack_id: null }],
      });
      expect(dbMock.getImagesByStackUngrouped).toHaveBeenCalledWith(7, { minRating: 2 });
    } finally {
      await new Promise<void>((resolve, reject) => routeServer.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('returns { ok: false, error } for thrown route errors', async () => {
    const dbMock = createDbMock();
    dbMock.getImageCount.mockRejectedValue(new Error('count exploded'));

    const app = createServerApp({
      dbModule: asDbModule(dbMock),
      apiService: asApiService(createApiServiceMock()),
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

describe('server eye keypoints and head geometry (#292)', () => {
  let server: Server | undefined;
  let baseUrl = '';
  let dbMock: ReturnType<typeof createDbMock> & { getEyeKeypointsBatch: ReturnType<typeof vi.fn>; getHeadGeometry: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    dbMock = { ...createDbMock(), getEyeKeypointsBatch: vi.fn(), getHeadGeometry: vi.fn() };
    const app = createServerApp({
      dbModule: asDbModule(dbMock),
      apiService: asApiService(createApiServiceMock()),
      configPath: '/tmp/nope.json',
      appConfig: {},
      backendBaseUrl: 'http://127.0.0.1:7860',
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server?.address();
        if (addr && typeof addr !== 'string') baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  it('returns eye keypoints for the requested ids', async () => {
    const eyes = { 7: { display_width: 4000, display_height: 6000, keypoints: [] } };
    dbMock.getEyeKeypointsBatch.mockResolvedValue(eyes);
    const res = await fetch(`${baseUrl}/gallery-api/db/eye-keypoints?ids=7&ids=9`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, data: eyes });
    expect(dbMock.getEyeKeypointsBatch).toHaveBeenCalledWith([7, 9]);
  });

  it('accepts comma-separated ids and drops invalid ones', async () => {
    dbMock.getEyeKeypointsBatch.mockResolvedValue({});
    await fetch(`${baseUrl}/gallery-api/db/eye-keypoints?ids=3,x,-1,4`);
    expect(dbMock.getEyeKeypointsBatch).toHaveBeenCalledWith([3, 4]);
  });

  it('returns an empty map without querying when no valid ids are given', async () => {
    const res = await fetch(`${baseUrl}/gallery-api/db/eye-keypoints?ids=abc`);
    await expect(res.json()).resolves.toEqual({ ok: true, data: {} });
    expect(dbMock.getEyeKeypointsBatch).not.toHaveBeenCalled();
  });

  it('rejects more ids than one grid page can ask for', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1).join(',');
    const res = await fetch(`${baseUrl}/gallery-api/db/eye-keypoints?ids=${ids}`);
    expect(res.status).toBe(400);
    expect(dbMock.getEyeKeypointsBatch).not.toHaveBeenCalled();
  });

  it('returns head geometry for an image', async () => {
    const geometry = { geometry: null, reason: 'no head keypoints' };
    dbMock.getHeadGeometry.mockResolvedValue(geometry);
    const res = await fetch(`${baseUrl}/gallery-api/db/image/12/head-geometry`);
    await expect(res.json()).resolves.toEqual({ ok: true, data: geometry });
    expect(dbMock.getHeadGeometry).toHaveBeenCalledWith(12);
  });

  it('rejects a non-numeric image id for head geometry', async () => {
    const res = await fetch(`${baseUrl}/gallery-api/db/image/abc/head-geometry`);
    expect(res.status).toBe(400);
    expect(dbMock.getHeadGeometry).not.toHaveBeenCalled();
  });
});

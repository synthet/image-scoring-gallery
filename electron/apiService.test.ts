import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineSubmitRequest } from './apiTypes';

const resolveBaseUrlMock = vi.fn<(config: unknown) => string>();

vi.mock('./apiUrlResolver', () => ({
  resolveBaseUrl: (config: unknown) => resolveBaseUrlMock(config),
}));

import { ApiService } from './apiService';

describe('ApiService', () => {
  const configLoader = vi.fn(() => ({ api: { url: 'http://config-url:7860' } }));

  beforeEach(() => {
    vi.clearAllMocks();
    resolveBaseUrlMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('resolves base URL once and re-resolves after resetBaseUrl()', () => {
    resolveBaseUrlMock
      .mockReturnValueOnce('http://resolved-one:7860')
      .mockReturnValueOnce('http://resolved-two:7860');

    const service = new ApiService(configLoader);

    expect(service.getBaseUrl()).toBe('http://resolved-one:7860');
    expect(service.getBaseUrl()).toBe('http://resolved-one:7860');
    expect(resolveBaseUrlMock).toHaveBeenCalledTimes(1);

    service.resetBaseUrl();

    expect(service.getBaseUrl()).toBe('http://resolved-two:7860');
    expect(resolveBaseUrlMock).toHaveBeenCalledTimes(2);
  });

  it('returns health payload for healthCheck()', async () => {
    resolveBaseUrlMock.mockReturnValue('http://api-host:7860');
    const healthFixture = {
      status: 'ok',
      scoring_available: true,
      tagging_available: true,
      clustering_available: false,
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(healthFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService(configLoader);
    await expect(service.healthCheck()).resolves.toEqual(healthFixture);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api-host:7860/api/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns success payload for submitPipeline()', async () => {
    resolveBaseUrlMock.mockReturnValue('http://api-host:7860');
    const submitRequest: PipelineSubmitRequest = {
      input_path: '/fixtures/folder',
      operations: ['score', 'tag'],
      skip_existing: true,
    };
    const submitFixture = {
      success: true,
      message: 'queued',
      data: { job_id: 'job-123' },
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(submitFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService(configLoader);

    await expect(service.submitPipeline(submitRequest)).resolves.toEqual(submitFixture);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api-host:7860/api/pipeline/submit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(submitRequest),
      }),
    );
  });

  it('propagates HTTP status and body text when backend returns non-2xx', async () => {
    resolveBaseUrlMock.mockReturnValue('http://api-host:7860');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('backend exploded', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService(configLoader);

    await expect(service.healthCheck()).rejects.toThrow(
      'API GET /api/health returned HTTP 503: backend exploded',
    );
  });

  it('translates AbortError into timeout message', async () => {
    resolveBaseUrlMock.mockReturnValue('http://api-host:7860');

    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService(configLoader);

    await expect(service.healthCheck()).rejects.toThrow(
      'API GET /api/health timed out after 10000ms',
    );
  });

  it('returns false from isAvailable() when request throws', async () => {
    resolveBaseUrlMock.mockReturnValue('http://api-host:7860');

    const fetchMock = vi.fn().mockRejectedValue(new Error('socket hang up'));
    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService(configLoader);

    await expect(service.isAvailable()).resolves.toBe(false);
  });
});

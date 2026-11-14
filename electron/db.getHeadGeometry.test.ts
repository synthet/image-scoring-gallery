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

import { getHeadGeometry } from './db';

const region = {
  region_id: 11, x1: '0.1', y1: '0.2', x2: '0.6', y2: '0.9', coord_space: 'display_normalized',
  display_width: 6000, display_height: 4000, selection_fresh: true,
};

describe('db.getHeadGeometry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the selected bird region and its current head keypoints', async () => {
    queryMock
      .mockResolvedValueOnce([region])
      .mockResolvedValueOnce([{ name: 'left_eye', x: '0.3', y: '0.4', confidence: '0.9', visible: true }]);

    const result = await getHeadGeometry(5);

    const [selectionSql, selectionParams] = queryMock.mock.calls[0];
    expect(selectionSql).toContain('FROM image_localization_selections s');
    expect(selectionSql).toContain('s.revoked_at IS NULL');
    expect(selectionParams).toEqual([5]);
    const [keypointSql, keypointParams] = queryMock.mock.calls[1];
    expect(keypointSql).toContain("kr.provider_key = 'bird_head_pose'");
    expect(keypointParams).toEqual([11]);
    expect(result).toEqual({ geometry: {
      region: [0.1, 0.2, 0.6, 0.9], display_width: 6000, display_height: 4000,
      keypoints: [{ name: 'left_eye', x: 0.3, y: 0.4, confidence: 0.9, visible: true }],
    } });
  });

  it('explains missing, stale and non-normalized selections without reading keypoints', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await getHeadGeometry(5)).toEqual({ geometry: null, reason: 'No authoritative bird selection' });
    queryMock.mockResolvedValueOnce([{ ...region, selection_fresh: false }]);
    expect(await getHeadGeometry(5)).toEqual({ geometry: null, reason: 'Bird selection is stale for this source or policy' });
    queryMock.mockResolvedValueOnce([{ ...region, coord_space: 'pixels' }]);
    expect(await getHeadGeometry(5)).toEqual({ geometry: null, reason: 'Subject coordinates need regeneration for this source rendition' });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it('reports an older schema instead of failing', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    expect(await getHeadGeometry(5)).toEqual({ geometry: null, reason: 'The database has no subject selections yet' });
  });
});

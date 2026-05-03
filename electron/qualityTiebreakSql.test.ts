import { describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
    getConfigPath: vi.fn(() => '/tmp/config.json'),
    loadAppApp: vi.fn(),
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
        query: vi.fn().mockResolvedValue([]),
        runTransaction: vi.fn(),
    })),
}));

import { QUALITY_TIEBREAK_ORDER_SQL_EX_I } from './db';

describe('QUALITY_TIEBREAK_ORDER_SQL_EX_I', () => {
    it('matches backend tie-break fragment (Postgres)', () => {
        expect(QUALITY_TIEBREAK_ORDER_SQL_EX_I).toContain('ex.iso ASC NULLS LAST');
        expect(QUALITY_TIEBREAK_ORDER_SQL_EX_I).toContain('SPLIT_PART(ex.exposure_time');
        expect(QUALITY_TIEBREAK_ORDER_SQL_EX_I).toContain('ex.date_time_original ASC NULLS LAST');
        expect(QUALITY_TIEBREAK_ORDER_SQL_EX_I).toContain('i.id ASC');
    });
});

import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from './apiUrlResolver';
import { createDatabaseConnector } from './db/provider';
import { DEFAULT_BACKEND_BASE_URL } from './constants/network';
import type { AppConfig, DatabaseConfig } from './types';

describe('default backend base URL consistency', () => {
  it('uses the same default base URL for API resolution and API DB connector', () => {
    const resolvedFromApiConfig = resolveBaseUrl({} as AppConfig);
    const connector = createDatabaseConnector({
      dbConfig: { engine: 'api', api: {} } as DatabaseConfig,
    });
    const resolvedFromDbProvider = (connector as { apiUrl?: string }).apiUrl;

    expect(resolvedFromApiConfig).toBe(DEFAULT_BACKEND_BASE_URL);
    expect(resolvedFromDbProvider).toBe(DEFAULT_BACKEND_BASE_URL);
  });
});


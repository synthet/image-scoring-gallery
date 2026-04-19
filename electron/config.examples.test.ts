import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { normalizeAppConfig } from './config';

describe('config examples', () => {
  function loadExample(filename: string) {
    const filePath = path.resolve(__dirname, '..', filename);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeAppConfig(raw);
  }

  it('normalizes config.example.json to postgres defaults with nested postgres config', () => {
    const normalized = loadExample('config.example.json');

    expect(normalized.database.engine).toBe('postgres');
    expect(normalized.database.provider).toBe('postgres');
    expect(normalized.database.postgres).toMatchObject({
      host: '127.0.0.1',
      port: 5432,
      database: 'image_scoring',
      user: 'postgres',
      password: 'postgres',
    });
  });

  it('normalizes environment.example.json with postgres shape and defaults', () => {
    const normalized = loadExample('environment.example.json');

    expect(normalized.database.engine).toBe('postgres');
    expect(normalized.database.provider).toBe('postgres');
    expect(normalized.database.postgres).toMatchObject({
      host: '127.0.0.1',
      port: 5432,
      database: 'image_scoring',
      user: 'postgres',
      password: 'postgres',
    });
    expect(normalized.database).not.toHaveProperty('api');
  });
});

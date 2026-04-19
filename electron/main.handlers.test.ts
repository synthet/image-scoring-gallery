import { describe, expect, it, vi } from 'vitest';
import {
  assertSyncPreviewAllowed,
  assertSyncRunAllowed,
  createSyncGuards,
  extractNefPreviewEnvelope,
  loadSystemConfig,
  saveSystemConfig,
} from './main.handlers';

describe('main handler helpers', () => {
  it('loads config via provided loader', async () => {
    const loadMock = vi.fn(() => ({ api: { url: 'http://127.0.0.1:7860' } }));
    await expect(loadSystemConfig(loadMock)).resolves.toEqual({ api: { url: 'http://127.0.0.1:7860' } });
  });

  it('saves config using deep merge + normalize path with mock fs', async () => {
    const readFile = vi.fn(async () => JSON.stringify({ api: { url: 'http://old' }, backup: { minScore: 70 } }));
    const writeFile = vi.fn(async () => undefined);

    const saved = await saveSystemConfig({
      configPath: '/tmp/config.json',
      updates: { api: { url: 'http://new' } },
      readFile,
      writeFile,
      existsSync: () => true,
    });

    expect(readFile).toHaveBeenCalledWith('/tmp/config.json', 'utf8');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(saved).toMatchObject({ api: { url: 'http://new' }, backup: { minScore: 70 } });
  });

  it('returns NEF success envelope when extractor returns bytes', async () => {
    const out = await extractNefPreviewEnvelope('/tmp/photo.nef', {
      platform: 'linux',
      extractPreview: async () => Buffer.from('nef-preview'),
      readFile: async () => Buffer.from('fallback'),
    });

    expect(out.success).toBe(true);
    expect(out.fallback).toBeUndefined();
    expect(out.buffer.toString()).toBe('nef-preview');
  });

  it('returns fallback envelope for non-NEF paths', async () => {
    const out = await extractNefPreviewEnvelope('/tmp/photo.jpg', {
      platform: 'linux',
      extractPreview: async () => null,
      readFile: async () => Buffer.from('jpg-bytes'),
    });

    expect(out).toMatchObject({ success: false, fallback: true });
    expect(out.buffer.toString()).toBe('jpg-bytes');
  });

  it('enforces sync guard flags for preview and run', () => {
    let backupRunning = false;
    const guards = createSyncGuards(() => backupRunning);

    expect(() => assertSyncPreviewAllowed(guards)).not.toThrow();
    guards.incrementPreviewCount();
    expect(() => assertSyncRunAllowed(guards)).toThrow('Sync preview is still running. Wait for it to finish before starting sync.');

    guards.decrementPreviewCount();
    guards.setSyncRunInProgress(true);
    expect(() => assertSyncPreviewAllowed(guards)).toThrow('A full sync is already in progress. Finish it before previewing.');
    expect(() => assertSyncRunAllowed(guards)).toThrow('Another sync operation is already in progress.');

    guards.setSyncRunInProgress(false);
    backupRunning = true;
    expect(() => assertSyncPreviewAllowed(guards)).toThrow('Backup is running. Finish backup before sync.');
  });
});

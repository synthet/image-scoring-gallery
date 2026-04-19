import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveBaseUrl } from './apiUrlResolver';
import type { AppConfig } from './types';

describe('resolveBaseUrl', () => {
  const mockFs = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
  });

  it('returns explicit URL from config.api.url', () => {
    const config: AppConfig = { api: { url: 'http://localhost:9000' } };
    expect(resolveBaseUrl(config)).toBe('http://localhost:9000');
  });

  it('strips trailing slash from config URL', () => {
    const config: AppConfig = { api: { url: 'http://x/' } };
    expect(resolveBaseUrl(config)).toBe('http://x');
  });

  it('uses lock file port when webui.lock exists', () => {
    const config: AppConfig = {};
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ port: 8000 }));

    const projectRoot = path.resolve(__dirname, '..');
    const result = resolveBaseUrl(config, {
      projectRoot,
      fs: mockFs,
    });

    expect(result).toBe('http://127.0.0.1:8000');
    expect(mockFs.existsSync).toHaveBeenCalled();
    expect(mockFs.readFileSync).toHaveBeenCalled();
  });

  it('prefers image-scoring-backend lock files over legacy image-scoring lock files', () => {
    const config: AppConfig = {};
    mockFs.existsSync.mockImplementation((filePath: string) => {
      return (
        filePath.endsWith(path.join('image-scoring-backend', 'webui.lock')) ||
        filePath.endsWith(path.join('image-scoring', 'webui.lock'))
      );
    });
    mockFs.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith(path.join('image-scoring-backend', 'webui.lock'))) {
        return JSON.stringify({ port: 8100 });
      }
      if (filePath.endsWith(path.join('image-scoring', 'webui.lock'))) {
        return JSON.stringify({ port: 8200 });
      }
      return JSON.stringify({});
    });

    const projectRoot = path.resolve(__dirname, '..');
    const result = resolveBaseUrl(config, {
      projectRoot,
      fs: mockFs,
    });

    expect(result).toBe('http://127.0.0.1:8100');
  });

  it('uses legacy image-scoring lock files when image-scoring-backend lock files are absent', () => {
    const config: AppConfig = {};
    mockFs.existsSync.mockImplementation((filePath: string) => {
      return filePath.endsWith(path.join('image-scoring', 'webui-debug.lock'));
    });
    mockFs.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith(path.join('image-scoring', 'webui-debug.lock'))) {
        return JSON.stringify({ port: 8300 });
      }
      return JSON.stringify({});
    });

    const projectRoot = path.resolve(__dirname, '..');
    const result = resolveBaseUrl(config, {
      projectRoot,
      fs: mockFs,
    });

    expect(result).toBe('http://127.0.0.1:8300');
  });

  it('uses default host:port when no config and no lock file', () => {
    const config: AppConfig = {};
    mockFs.existsSync.mockReturnValue(false);

    const projectRoot = path.resolve(__dirname, '..');
    const result = resolveBaseUrl(config, {
      projectRoot,
      fs: mockFs,
    });

    expect(result).toBe('http://127.0.0.1:7860');
  });

  it('uses config.api.port and config.api.host when provided', () => {
    const config: AppConfig = {
      api: { port: 3000, host: '192.168.1.1' },
    };
    mockFs.existsSync.mockReturnValue(false);

    const projectRoot = path.resolve(__dirname, '..');
    const result = resolveBaseUrl(config, {
      projectRoot,
      fs: mockFs,
    });

    expect(result).toBe('http://192.168.1.1:3000');
  });

  it('falls back to default port when lock file has no port', () => {
    const config: AppConfig = {};
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

    const projectRoot = path.resolve(__dirname, '..');
    const result = resolveBaseUrl(config, {
      projectRoot,
      fs: mockFs,
    });

    expect(result).toBe('http://127.0.0.1:7860');
  });

  it('handles error during lock file reading', () => {
    const config: AppConfig = {};
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('Read error');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const projectRoot = path.resolve(__dirname, '..');
    const result = resolveBaseUrl(config, {
      projectRoot,
      fs: mockFs,
    });

    expect(result).toBe('http://127.0.0.1:7860');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Lock file read error'), expect.anything());
    consoleSpy.mockRestore();
  });
});

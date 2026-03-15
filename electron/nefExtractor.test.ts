import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock exiftool-vendored before importing the module under test
vi.mock('exiftool-vendored', () => ({
  exiftool: {
    read: vi.fn(),
    extractJpgFromRaw: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  },
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    unlink: vi.fn(),
  },
  readFile: vi.fn(),
  unlink: vi.fn(),
}));

import { exiftool } from 'exiftool-vendored';
import fs from 'fs/promises';

// Force a fresh singleton for each describe block
let NefExtractor: typeof import('./nefExtractor').NefExtractor;
let nefExtractor: import('./nefExtractor').NefExtractor;

describe('NefExtractor', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Ensure the singleton is reset between tests by reimporting
    vi.resetModules();
    const mod = await import('./nefExtractor');
    NefExtractor = mod.NefExtractor;
    nefExtractor = NefExtractor.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('returns the same instance on repeated calls', () => {
      const a = NefExtractor.getInstance();
      const b = NefExtractor.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('extractPreview', () => {
    it('returns a Buffer on successful extraction without rotation', async () => {
      const fakeBuffer = Buffer.from('jpeg-data');
      vi.mocked(exiftool.read).mockResolvedValue({ Orientation: '1' } as never);
      vi.mocked(exiftool.extractJpgFromRaw).mockResolvedValue(undefined as never);
      vi.mocked(fs.readFile).mockResolvedValue(fakeBuffer as never);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await nefExtractor.extractPreview('/path/to/photo.nef');

      expect(result).toBe(fakeBuffer);
      expect(exiftool.read).toHaveBeenCalledWith('/path/to/photo.nef');
      expect(exiftool.extractJpgFromRaw).toHaveBeenCalled();
      // No write call because orientation is '1' (horizontal/normal)
      expect(exiftool.write).not.toHaveBeenCalled();
    });

    it('applies orientation tag when orientation is not normal', async () => {
      const fakeBuffer = Buffer.from('rotated-jpeg');
      vi.mocked(exiftool.read).mockResolvedValue({ Orientation: 'Rotate 90 CW' } as never);
      vi.mocked(exiftool.extractJpgFromRaw).mockResolvedValue(undefined as never);
      vi.mocked(exiftool.write).mockResolvedValue(undefined as never);
      vi.mocked(fs.readFile).mockResolvedValue(fakeBuffer as never);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await nefExtractor.extractPreview('/path/to/photo.nef');

      expect(result).toBe(fakeBuffer);
      expect(exiftool.write).toHaveBeenCalledWith(
        expect.any(String),
        { Orientation: 'Rotate 90 CW' },
        ['-overwrite_original']
      );
    });

    it('skips orientation write when orientation is "Horizontal (normal)"', async () => {
      const fakeBuffer = Buffer.from('normal-jpeg');
      vi.mocked(exiftool.read).mockResolvedValue({ Orientation: 'Horizontal (normal)' } as never);
      vi.mocked(exiftool.extractJpgFromRaw).mockResolvedValue(undefined as never);
      vi.mocked(fs.readFile).mockResolvedValue(fakeBuffer as never);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await nefExtractor.extractPreview('/path/to/photo.nef');

      expect(exiftool.write).not.toHaveBeenCalled();
      expect(result).toBe(fakeBuffer);
    });

    it('returns null when exiftool.read throws', async () => {
      vi.mocked(exiftool.read).mockRejectedValue(new Error('exiftool error'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await nefExtractor.extractPreview('/bad/path.nef');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null and emits ENOENT message when file is missing', async () => {
      const enoentErr = Object.assign(new Error('no such file'), { code: 'ENOENT' });
      vi.mocked(exiftool.read).mockRejectedValue(enoentErr);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await nefExtractor.extractPreview('/missing.nef');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      );
      consoleSpy.mockRestore();
    });

    it('cleans up temp file even when extraction fails', async () => {
      vi.mocked(exiftool.read).mockRejectedValue(new Error('fail'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await nefExtractor.extractPreview('/path.nef');

      expect(fs.unlink).toHaveBeenCalled();
    });

    it('cleans up temp file after successful extraction', async () => {
      vi.mocked(exiftool.read).mockResolvedValue({ Orientation: 1 } as never);
      vi.mocked(exiftool.extractJpgFromRaw).mockResolvedValue(undefined as never);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data') as never);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await nefExtractor.extractPreview('/photo.nef');

      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('calls exiftool.end on cleanup', async () => {
      vi.mocked(exiftool.end).mockResolvedValue(undefined as never);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await nefExtractor.cleanup();

      expect(exiftool.end).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs error if exiftool.end throws', async () => {
      vi.mocked(exiftool.end).mockRejectedValue(new Error('cleanup fail'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await nefExtractor.cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup error'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });
});

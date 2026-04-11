import { describe, it, expect } from 'vitest';
import { parseMediaUrlToFilePath } from './mediaUrlParse';

describe('parseMediaUrlToFilePath', () => {
    const platform = process.platform;

    it('reconstructs WSL path when Chromium splits media://mnt/d/... (host mnt)', () => {
        const out = parseMediaUrlToFilePath('media://mnt/d/Photos/Z8/105mm/2026/DSC_3658.NEF');
        if (platform === 'win32') {
            expect(out).toBe('D:/Photos/Z8/105mm/2026/DSC_3658.NEF');
        } else {
            expect(out).toBe('/mnt/d/Photos/Z8/105mm/2026/DSC_3658.NEF');
        }
    });

    it('keeps correct media:///mnt/d/... pathname (empty host)', () => {
        const out = parseMediaUrlToFilePath('media:///mnt/d/Photos/a.NEF');
        if (platform === 'win32') {
            expect(out).toBe('D:/Photos/a.NEF');
        } else {
            expect(out).toBe('/mnt/d/Photos/a.NEF');
        }
    });

    it('recovers Windows drive from media://d/... host split', () => {
        if (process.platform !== 'win32') return;
        const out = parseMediaUrlToFilePath('media://d/Projects/x.jpg');
        expect(out).toBe('D:/Projects/x.jpg');
    });

    it('uses path query param unchanged through mnt conversion', () => {
        const out = parseMediaUrlToFilePath(
            'media:///?path=' + encodeURIComponent('/mnt/d/Photos/b.NEF'),
        );
        if (platform === 'win32') {
            expect(out).toBe('D:/Photos/b.NEF');
        } else {
            expect(out).toBe('/mnt/d/Photos/b.NEF');
        }
    });
});

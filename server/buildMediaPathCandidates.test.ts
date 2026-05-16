import { describe, it, expect } from 'vitest';
import path from 'path';
import { buildMediaPathCandidates } from './buildMediaPathCandidates';

describe('buildMediaPathCandidates', () => {
    const projectRoot = path.resolve(__dirname, '..');

    it('includes tail under configured thumbnail_base_dir for WSL /mnt paths', () => {
        const mnt =
            '/mnt/d/Projects/image-scoring-backend/thumbnails/91/9160e38dff72710fd8e3857247dac739.jpg';
        const base = '/data/thumbnails';
        const list = buildMediaPathCandidates(mnt, projectRoot, {
            thumbnail_base_dir: base,
        });
        expect(list).toContain(path.join(base, '91', '9160e38dff72710fd8e3857247dac739.jpg'));
    });

    it('extracts tail from Windows-style thumbnail paths', () => {
        const win = 'D:\\Projects\\image-scoring-backend\\thumbnails\\14\\1426624c84f38186dd00a02aa53d1700.jpg';
        const base = '/var/thumbs';
        const list = buildMediaPathCandidates(win, projectRoot, { thumbnail_base_dir: base });
        expect(list).toContain(path.join(base, '14', '1426624c84f38186dd00a02aa53d1700.jpg'));
    });

    it('adds nested shard path when DB has legacy flat thumbnails/32hex.jpg', () => {
        const flat =
            '/mnt/d/Projects/image-scoring-backend/thumbnails/8a6ba057d19e8cca4f6869be55.jpg';
        const base = '/backend/thumbnails';
        const list = buildMediaPathCandidates(flat, projectRoot, { thumbnail_base_dir: base });
        expect(list).toContain(path.join(base, '8a6ba057d19e8cca4f6869be55.jpg'));
        expect(list).toContain(path.join(base, '8a', '8a6ba057d19e8cca4f6869be55.jpg'));
    });

    it('adds Windows drive path when host is win32 and DB stores /mnt/...', () => {
        const mnt = '/mnt/d/Photos/Z8/180-600mm/2024/2024-04-21/DSC_1382.NEF';
        const list = buildMediaPathCandidates(mnt, projectRoot, undefined, {
            hostPlatform: 'win32',
        });
        expect(list.some((c) => c.replace(/\\/g, '/') === 'D:/Photos/Z8/180-600mm/2024/2024-04-21/DSC_1382.NEF')).toBe(
            true,
        );
    });
});

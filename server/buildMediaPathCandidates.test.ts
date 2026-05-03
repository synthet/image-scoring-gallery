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
});

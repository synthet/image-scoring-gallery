import path from 'path';
import { describe, expect, it } from 'vitest';
import {
    absolutizeThumbnailPath,
    collapseMalformedThumbnailSegments,
    stripDockerAppThumbnailPrefix,
    stripThumbnailRepoRelativePrefix,
} from './thumbnailPathNormalize';

describe('collapseMalformedThumbnailSegments', () => {
    it('collapses thumbnails/app/thumbnails to a single thumbnails segment', () => {
        const s =
            '../../image-scoring-backend/thumbnails/app/thumbnails/2a/abc.jpg';
        expect(collapseMalformedThumbnailSegments(s)).toBe(
            '../../image-scoring-backend/thumbnails/2a/abc.jpg',
        );
    });
});

describe('stripThumbnailRepoRelativePrefix', () => {
    it('strips repeated ../ repo-relative prefix', () => {
        expect(
            stripThumbnailRepoRelativePrefix(
                '../../image-scoring-backend/thumbnails/app/x.jpg',
            ),
        ).toBe('app/x.jpg');
    });
});

describe('stripDockerAppThumbnailPrefix', () => {
    it('strips /app/thumbnails/ and static/app/thumbnails/', () => {
        expect(stripDockerAppThumbnailPrefix('app/thumbnails/ab/cd.jpg')).toBe('ab/cd.jpg');
        expect(stripDockerAppThumbnailPrefix('static/app/thumbnails/ab/cd.jpg')).toBe('ab/cd.jpg');
    });
});

describe('absolutizeThumbnailPath', () => {
    it('joins repo-relative leaking paths to default sibling thumbnails root', () => {
        const projectRoot =
            process.platform === 'win32'
                ? 'D:/Projects/image-scoring-gallery'
                : '/mnt/c/Projects/image-scoring-gallery';
        const expectedBase =
            process.platform === 'win32'
                ? path.normalize('D:/Projects/image-scoring-backend/thumbnails')
                : path.normalize('/mnt/c/Projects/image-scoring-backend/thumbnails');
        const raw =
            '../../image-scoring-backend/thumbnails/app/thumbnails/2a/abc.jpg';
        const out = absolutizeThumbnailPath(raw, projectRoot);
        expect(out).toBe(path.join(expectedBase, '2a', 'abc.jpg'));
    });

    it('uses explicit thumbnailBaseDir when set', () => {
        const base = path.normalize('/data/thumbs-root');
        const galleryRoot =
            process.platform === 'win32'
                ? 'D:/Projects/image-scoring-gallery'
                : '/mnt/c/Projects/image-scoring-gallery';
        const out = absolutizeThumbnailPath('thumbnails/aa/h.jpg', galleryRoot, base);
        expect(out).toBe(path.join(base, 'aa', 'h.jpg'));
    });

    it('resolves relative thumbnailBaseDir against projectRoot', () => {
        const galleryRoot =
            process.platform === 'win32'
                ? 'D:/Projects/image-scoring-gallery'
                : '/mnt/c/Projects/image-scoring-gallery';
        const out = absolutizeThumbnailPath(
            'aa/h.jpg',
            galleryRoot,
            '../image-scoring-backend/thumbnails',
        );
        const expectedBase =
            process.platform === 'win32'
                ? path.normalize('D:/Projects/image-scoring-backend/thumbnails')
                : path.normalize('/mnt/c/Projects/image-scoring-backend/thumbnails');
        expect(out).toBe(path.join(expectedBase, 'aa', 'h.jpg'));
    });

    it('passes through absolute Windows paths', () => {
        const p = 'D:/cache/thumbnails/z.jpg';
        const galleryRoot =
            process.platform === 'win32'
                ? 'D:/Projects/image-scoring-gallery'
                : '/mnt/c/Projects/image-scoring-gallery';
        expect(absolutizeThumbnailPath(p, galleryRoot)).toBe(
            path.normalize('D:/cache/thumbnails/z.jpg'),
        );
    });

    it('passes through /mnt/... paths', () => {
        const p = '/mnt/d/Projects/image-scoring-backend/thumbnails/aa/h.jpg';
        const galleryRoot =
            process.platform === 'win32'
                ? 'D:/Projects/image-scoring-gallery'
                : '/mnt/c/Projects/image-scoring-gallery';
        expect(absolutizeThumbnailPath(p, galleryRoot)).toBe(path.normalize(p));
    });

    it('remaps Docker /app/thumbnails/... to host thumbnail base', () => {
        const galleryRoot =
            process.platform === 'win32'
                ? 'D:/Projects/image-scoring-gallery'
                : '/mnt/c/Projects/image-scoring-gallery';
        const expectedBase =
            process.platform === 'win32'
                ? path.normalize('D:/Projects/image-scoring-backend/thumbnails')
                : path.normalize('/mnt/c/Projects/image-scoring-backend/thumbnails');
        const hashFile = '0e7367b97feead9686cf003b8c0adc9d.jpg';
        expect(absolutizeThumbnailPath(`/app/thumbnails/${hashFile}`, galleryRoot)).toBe(
            path.join(expectedBase, hashFile),
        );
        expect(
            absolutizeThumbnailPath(`static/app/thumbnails/${hashFile}`, galleryRoot),
        ).toBe(path.join(expectedBase, hashFile));
        expect(absolutizeThumbnailPath(`\\app\\thumbnails\\${hashFile}`, galleryRoot)).toBe(
            path.join(expectedBase, hashFile),
        );
    });
});

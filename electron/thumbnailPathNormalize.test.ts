import { describe, expect, it } from 'vitest';
import {
    collapseMalformedThumbnailSegments,
    stripThumbnailRepoRelativePrefix,
} from './thumbnailPathNormalize';

describe('collapseMalformedThumbnailSegments', () => {
    it('collapses thumbnails/app/thumbnails with forward slashes', () => {
        expect(
            collapseMalformedThumbnailSegments(
                '../image-scoring-backend/thumbnails/app/thumbnails/a7/a7d45b00d6342eb4c5f44e4bbcd07007.jpg',
            ),
        ).toBe('../image-scoring-backend/thumbnails/a7/a7d45b00d6342eb4c5f44e4bbcd07007.jpg');
    });

    it('collapses thumbnails\\app\\thumbnails on Windows-style paths', () => {
        expect(
            collapseMalformedThumbnailSegments(
                'D:\\Projects\\image-scoring-backend\\thumbnails\\app\\thumbnails\\a7\\x.jpg',
            ),
        ).toBe('D:\\Projects\\image-scoring-backend\\thumbnails\\a7\\x.jpg');
    });
});

describe('stripThumbnailRepoRelativePrefix', () => {
    it('strips leading ../image-scoring-backend/thumbnails/', () => {
        expect(stripThumbnailRepoRelativePrefix('../image-scoring-backend/thumbnails/a7/x.jpg')).toBe('a7/x.jpg');
    });

    it('strips repeated .. segments', () => {
        expect(stripThumbnailRepoRelativePrefix('../../image-scoring-backend/thumbnails/a7/x.jpg')).toBe('a7/x.jpg');
    });
});

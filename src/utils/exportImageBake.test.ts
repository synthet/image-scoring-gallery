import { describe, expect, it } from 'vitest';
import { bakeExifOrientationToBlob } from './exportImageBake';

describe('bakeExifOrientationToBlob', () => {
    it('returns null for non-raster or SVG', async () => {
        expect(await bakeExifOrientationToBlob(new Blob([''], { type: 'image/svg+xml' }), 'image/jpeg')).toBeNull();
        expect(await bakeExifOrientationToBlob(new Blob([''], { type: 'application/octet-stream' }), 'image/jpeg')).toBeNull();
    });
});

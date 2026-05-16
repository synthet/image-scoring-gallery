import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bakeExifOrientationToBlob, getJpegOrientation } from './exportImageBake';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('bakeExifOrientationToBlob', () => {
    it('returns null for non-raster or SVG', async () => {
        expect(await bakeExifOrientationToBlob(new Blob([''], { type: 'image/svg+xml' }), 'image/jpeg')).toBeNull();
        expect(await bakeExifOrientationToBlob(new Blob([''], { type: 'application/octet-stream' }), 'image/jpeg')).toBeNull();
    });

    it('fixture tiny2x2_orient3.jpg has EXIF orientation 3 (non-1)', async () => {
        const bytes = readFileSync(join(__dirname, 'fixtures', 'tiny2x2_orient3.jpg'));
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        expect(await getJpegOrientation(blob)).toBe(3);
    });
});

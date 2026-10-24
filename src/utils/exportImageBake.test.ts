// @ts-expect-error vitest node imports in jsdom test
import { readFileSync } from 'node:fs';
// @ts-expect-error vitest node imports in jsdom test
import { dirname, join } from 'node:path';
// @ts-expect-error vitest node imports in jsdom test
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bakeExifOrientationToBlob, getJpegOrientation } from './exportImageBake';
import { createJpegWithApp1 } from './jpegTestFixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('bakeExifOrientationToBlob', () => {
    function mockCanvas() {
        const ctx = { drawImage: vi.fn(), transform: vi.fn() };
        const canvas = document.createElement('canvas');
        vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
        vi.spyOn(canvas, 'toBlob').mockImplementation(callback => callback(new Blob(['upright'], { type: 'image/jpeg' })));
        vi.spyOn(document, 'createElement').mockReturnValue(canvas);
        return ctx;
    }

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it.each([2, 3, 4, 5, 6, 7, 8])('keeps browser-oriented pixels without applying EXIF %s twice', async orientation => {
        class OrientedBitmap {
            width = 100;
            height = 200;
            close = vi.fn();
        }
        const bitmap = new OrientedBitmap();
        const decode = vi.fn().mockResolvedValue(bitmap);
        vi.stubGlobal('ImageBitmap', OrientedBitmap);
        vi.stubGlobal('createImageBitmap', decode);
        const ctx = mockCanvas();

        const result = await bakeExifOrientationToBlob(createJpegWithApp1([{ type: 'EXIF', data: [orientation] }]), 'image/jpeg');

        expect(result).toMatchObject({ width: 100, height: 200, sourceOrientation: orientation, didNormalize: true });
        expect(decode).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' });
        expect(ctx.transform).not.toHaveBeenCalled();
        expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
        expect(bitmap.close).toHaveBeenCalledOnce();
    });

    it('applies source RAW orientation when the extracted JPEG has no orientation tag', async () => {
        class RawBitmap {
            width = 200;
            height = 100;
            close = vi.fn();
        }
        vi.stubGlobal('ImageBitmap', RawBitmap);
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(new RawBitmap()));
        const ctx = mockCanvas();

        const result = await bakeExifOrientationToBlob(createJpegWithApp1([]), 'image/jpeg', 8);

        expect(result).toMatchObject({ width: 100, height: 200, sourceOrientation: 8, didNormalize: true });
        expect(ctx.transform).toHaveBeenCalledOnce();
        expect(ctx.transform).toHaveBeenCalledWith(0, -1, 1, 0, 0, 200);
    });

    it('keeps HTML image fallback orientation without a second rotation', async () => {
        class OrientedImage {
            naturalWidth = 100;
            naturalHeight = 200;
            style = { imageOrientation: '' };
            decoding = '';
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) { queueMicrotask(() => this.onload?.()); }
        }
        vi.stubGlobal('Image', OrientedImage);
        vi.stubGlobal('ImageBitmap', class {});
        vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Decoder unavailable')));
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
        const ctx = mockCanvas();

        const result = await bakeExifOrientationToBlob(createJpegWithApp1([{ type: 'EXIF', data: [8] }]), 'image/jpeg');

        expect(result).toMatchObject({ width: 100, height: 200, didNormalize: true });
        expect(ctx.transform).not.toHaveBeenCalled();
        expect(ctx.drawImage.mock.calls[0][0].style.imageOrientation).toBe('from-image');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });

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

import { describe, expect, it } from 'vitest';
import { getJpegOrientation } from './exportImageBake';
import { createJpegWithApp1 } from './jpegTestFixtures';

/** EXIF APP1 with IFD0 containing zero tags (no orientation). */
function createJpegExifEmptyIfd(): Blob {
    const parts: number[] = [0xff, 0xd8];
    // APP1 length = 2 (len) + 6 Exif + 2 byte order + 2 forty-two + 4 IFD offset + 2 num entries + 4 next IFD
    const tiffPayload = [
        0x49,
        0x49,
        0x2a,
        0x00, // II, 42
        0x08,
        0x00,
        0x00,
        0x00, // IFD0 at offset 8 from TIFF start
        0x00,
        0x00, // 0 entries
        0x00,
        0x00,
        0x00,
        0x00, // no next IFD
    ];
    const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    const segmentBody = [...exifHeader, ...tiffPayload];
    const length = segmentBody.length + 2;
    parts.push(0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...segmentBody);
    parts.push(0xff, 0xd9);
    return new Blob([new Uint8Array(parts)], { type: 'image/jpeg' });
}

describe('getJpegOrientation', () => {
    it('returns null for non-JPEG blobs', async () => {
        const blob = new Blob(['not a jpeg'], { type: 'text/plain' });
        expect(await getJpegOrientation(blob)).toBeNull();
    });

    it('returns null for JPEG with no EXIF', async () => {
        const blob = createJpegWithApp1([]);
        expect(await getJpegOrientation(blob)).toBeNull();
    });

    it('detects orientation in simple EXIF JPEG', async () => {
        const blob = createJpegWithApp1([{ type: 'EXIF', data: [3] }]); // Orientation 3 (180 deg)
        expect(await getJpegOrientation(blob)).toBe(3);
    });

    it('handles XMP segment preceding EXIF segment (Nikon Z8/Z9 case)', async () => {
        const xmpData = Array.from(new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0some-xmp-data'));
        const blob = createJpegWithApp1([
            { type: 'XMP', data: xmpData },
            { type: 'EXIF', data: [6] }, // Orientation 6 (90 deg CW)
        ]);
        expect(await getJpegOrientation(blob)).toBe(6);
    });

    it('returns null if EXIF IFD has no orientation tag', async () => {
        const blob = createJpegExifEmptyIfd();
        expect(await getJpegOrientation(blob)).toBeNull();
    });
});

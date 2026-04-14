/**
 * Re-encode raster image so pixel data matches browser preview (EXIF Orientation applied).
 * Raw fetch bytes often stay sensor-oriented while <img> rotates for display.
 *
 * Tries createImageBitmap({ imageOrientation: 'from-image' }) first; falls back to
 * decoding via HTMLImageElement + drawImage (same oriented pixels as <img> in Chromium).
 */

function canvasToBlob(
    canvas: HTMLCanvasElement,
    outMime: string
): Promise<Blob | null> {
    const quality = outMime === 'image/jpeg' ? 0.92 : undefined;
    return new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), outMime, quality);
    });
}


/**
 * Minimal JPEG EXIF orientation parser.
 * Works by scanning for APP1 marker and then the TIFF header.
 */
export async function getJpegOrientation(blob: Blob): Promise<number | null> {
    if (blob.type !== 'image/jpeg') return null;

    const buffer = await blob.slice(0, 65536).arrayBuffer();
    const view = new DataView(buffer);

    if (view.byteLength < 2 || view.getUint16(0) !== 0xFFD8) return null; // Not a JPEG

    let offset = 2;
    while (offset < view.byteLength) {
        if (view.getUint16(offset) === 0xFFE1) {
            // Found APP1
            offset += 4;
            if (view.getUint32(offset) !== 0x45786966) return null; // Not "Exif"
            offset += 6;

            const tiffOffset = offset;
            const bigEndian = view.getUint16(offset) === 0x4D4D;
            offset += 2;
            if (view.getUint16(offset, !bigEndian) !== 0x002A) return null; // Missing 42
            offset += 2;

            const firstIfdOffset = view.getUint32(offset, !bigEndian);
            offset = tiffOffset + firstIfdOffset;

            const entries = view.getUint16(offset, !bigEndian);
            offset += 2;

            for (let i = 0; i < entries; i++) {
                const tag = view.getUint16(offset + (i * 12), !bigEndian);
                if (tag === 0x0112) {
                    // Orientation tag
                    return view.getUint16(offset + (i * 12) + 8, !bigEndian);
                }
            }
            return null;
        } else {
            const length = view.getUint16(offset + 2);
            offset += 2 + length;
        }
    }
    return null;
}

export interface BakeResult {
    blob: Blob;
    sourceOrientation: number | null;
    didNormalize: boolean;
    width: number;
    height: number;
}

/**
 * Deterministically re-encodes a raster image so pixels are physically upright.
 * Handles all 8 EXIF orientation tags + mirror cases.
 */
export async function bakeExifOrientationToBlob(blob: Blob, outMime: string): Promise<BakeResult | null> {
    const t = blob.type || '';
    if (!t.startsWith('image/') || t === 'image/svg+xml') {
        console.warn(`[ImageViewer] export bake: skipping non-raster type ${t}`);
        return null;
    }

    const orientation = await getJpegOrientation(blob);
    const didNormalize = orientation != null && orientation > 1;

    const objectUrl = URL.createObjectURL(blob);
    try {
        const img = new Image();
        img.decoding = 'async';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image decode failed'));
            img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        let { naturalWidth: width, naturalHeight: height } = img;

        // Swap dimensions for 90-degree rotations (5, 6, 7, 8)
        if (orientation && orientation >= 5 && orientation <= 8) {
            canvas.width = height;
            canvas.height = width;
        } else {
            canvas.width = width;
            canvas.height = height;
        }

        // Apply EXIF transformation matrix
        if (orientation && orientation > 1) {
            console.debug(`[ImageViewer] export bake: applying manual rotation for orientation ${orientation}`);
            switch (orientation) {
                case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
                case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
                case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
                case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
                case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
                case 7: ctx.transform(0, -1, -1, 0, height, width); break;
                case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
            }
        }

        ctx.drawImage(img, 0, 0);
        const outBlob = await canvasToBlob(canvas, outMime);

        if (!outBlob) return null;

        return {
            blob: outBlob,
            sourceOrientation: orientation,
            didNormalize,
            width: canvas.width,
            height: canvas.height
        };
    } catch (e) {
        console.error('[ImageViewer] export bake: failed', e);
        return null;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

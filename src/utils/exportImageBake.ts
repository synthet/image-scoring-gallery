/**
 * Re-encode via canvas so the on-disk pixels match what <img> displays.
 * Chromium auto-applies EXIF orientation during decode (image-orientation: from-image
 * is the spec default since Chrome 81), so drawImage yields upright pixels with no
 * manual transform. The output is then saved with Orientation=1.
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

        const { naturalWidth: width, naturalHeight: height } = img;
        canvas.width = width;
        canvas.height = height;

        if (orientation && orientation > 1) {
            console.debug(`[ImageViewer] export bake: source orientation ${orientation}, relying on <img> auto-orient`);
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

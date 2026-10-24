/**
 * Re-encode via canvas so exported pixels are physically upright (EXIF orientation 1).
 *
 * Decode with browser EXIF orientation and draw those upright pixels directly.
 * Chromium can auto-orient even when asked for `imageOrientation: 'none'`.
 * Manual transforms are only needed for RAW extracts whose JPEG lacks the source TIFF orientation.
 * Main process must still
 * force EXIF Orientation=1 after save — see docs/features/implemented/05-jpeg-export-exif-orientation.md
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

    // Large embedded previews (e.g. Nikon Z8 full-size JFIF) may place a second APP1 (XMP)
    // before EXIF; keep a generous window so we still find IFD0 Orientation.
    const buffer = await blob.slice(0, Math.min(blob.size, 786432)).arrayBuffer();
    const view = new DataView(buffer);

    if (view.byteLength < 2 || view.getUint16(0) !== 0xFFD8) return null; // Not a JPEG

    let offset = 2;
    while (offset < view.byteLength) {
        const marker = view.getUint16(offset);
        if (marker === 0xFFE1) {
            // Found APP1
            const length = view.getUint16(offset + 2);
            if (view.getUint32(offset + 4) === 0x45786966) {
                // It's an EXIF segment
                offset += 10;

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
                // Not "Exif" (e.g. XMP), skip this segment
                offset += 2 + length;
            }
        } else if ((marker & 0xFF00) === 0xFF00) {
            // Some other marker. Markers 0xFFD0-0xFFD9 and 0xFF01 do not have length fields.
            if (marker === 0xFFD8 || marker === 0xFF01 || (marker >= 0xFFD0 && marker <= 0xFFD7)) {
                offset += 2;
            } else if (marker === 0xFFD9) {
                break; // End of Image
            } else {
                if (offset + 4 > view.byteLength) break;
                const length = view.getUint16(offset + 2);
                offset += 2 + length;
            }
        } else {
            // Not a marker, should not happen in valid JPEG structure
            break;
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
export async function bakeExifOrientationToBlob(blob: Blob, outMime: string, sourceOrientation?: number): Promise<BakeResult | null> {
    const t = blob.type || '';
    if (!t.startsWith('image/') || t === 'image/svg+xml') {
        console.warn(`[ImageViewer] export bake: skipping non-raster type ${t}`);
        return null;
    }

    const jpegOrientation = await getJpegOrientation(blob);
    const fallbackOrientation = (jpegOrientation == null || jpegOrientation === 1)
        && sourceOrientation != null && Number.isInteger(sourceOrientation) && sourceOrientation >= 2 && sourceOrientation <= 8
        ? sourceOrientation : null;
    const orientation = fallbackOrientation ?? jpegOrientation;
    const hasOrientation = orientation != null && orientation > 1;

    try {
        let orientedWidth = 0;
        let orientedHeight = 0;
        let drawSource: ImageBitmap | HTMLImageElement;

        // Both decoders return display-oriented pixels. Do not rotate their EXIF a second time.
        try {
            const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
            drawSource = bitmap;
            orientedWidth = bitmap.width;
            orientedHeight = bitmap.height;
            console.debug(`[ImageViewer] export bake: using createImageBitmap (oriented pixels, orientation ${orientation ?? 1})`);
        } catch (e) {
            console.warn('[ImageViewer] export bake: createImageBitmap failed, falling back to <img>', e);
            
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.decoding = 'async';
            img.style.imageOrientation = 'from-image';
            
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Image decode failed'));
                img.src = objectUrl;
            });
            URL.revokeObjectURL(objectUrl);
            
            drawSource = img;
            orientedWidth = img.naturalWidth;
            orientedHeight = img.naturalHeight;
        }

        const rawWidth = orientedWidth;
        const rawHeight = orientedHeight;

        // Swap dimensions for 90/270 degree rotations
        if (fallbackOrientation && fallbackOrientation >= 5 && fallbackOrientation <= 8) {
            const tmp = orientedWidth;
            orientedWidth = orientedHeight;
            orientedHeight = tmp;
        }

        const canvas = document.createElement('canvas');
        canvas.width = orientedWidth;
        canvas.height = orientedHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        if (fallbackOrientation) {
            console.debug(`[ImageViewer] export bake: applying missing RAW orientation ${fallbackOrientation}`);
            applyOrientationTransform(ctx, fallbackOrientation, rawWidth, rawHeight);
        }

        ctx.drawImage(drawSource, 0, 0);
        
        if (drawSource instanceof ImageBitmap) {
            drawSource.close();
        }

        const outBlob = await canvasToBlob(canvas, outMime);
        if (!outBlob) return null;

        return {
            blob: outBlob,
            sourceOrientation: orientation,
            didNormalize: hasOrientation,
            width: canvas.width,
            height: canvas.height
        };
    } catch (e) {
        console.error('[ImageViewer] export bake: failed', e);
        return null;
    }
}

/**
 * Applies CSS-like orientation transforms to a canvas context (EXIF 2–8).
 * Exported for unit tests; used by `bakeExifOrientationToBlob`.
 */
export function applyOrientationTransform(
    ctx: CanvasRenderingContext2D,
    orientation: number,
    width: number,
    height: number,
) {
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

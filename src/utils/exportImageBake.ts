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

async function bakeViaImageBitmap(blob: Blob, outMime: string): Promise<Blob | null> {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        const out = await canvasToBlob(canvas, outMime);
        if (out) {
            console.debug('[ImageViewer] export bake: createImageBitmap path ok', {
                w: bitmap.width,
                h: bitmap.height,
            });
        }
        return out;
    } finally {
        bitmap.close();
    }
}

async function bakeViaHtmlImage(blob: Blob, outMime: string): Promise<Blob | null> {
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
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        const out = await canvasToBlob(canvas, outMime);
        if (out) {
            console.debug('[ImageViewer] export bake: HTMLImageElement fallback ok', {
                w: img.naturalWidth,
                h: img.naturalHeight,
            });
        } else {
            console.debug('[ImageViewer] export bake: HTMLImageElement fallback produced null blob');
        }
        return out;
    } catch (e) {
        console.debug('[ImageViewer] export bake: HTMLImageElement fallback failed', e);
        return null;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function bakeExifOrientationToBlob(blob: Blob, outMime: string): Promise<Blob | null> {
    const t = blob.type || '';
    if (!t.startsWith('image/') || t === 'image/svg+xml') {
        return null;
    }
    try {
        const out = await bakeViaImageBitmap(blob, outMime);
        if (out) {
            return out;
        }
        console.debug('[ImageViewer] export bake: createImageBitmap path returned null, trying img fallback');
    } catch (e) {
        console.debug('[ImageViewer] export bake: createImageBitmap failed', e);
    }
    return bakeViaHtmlImage(blob, outMime);
}

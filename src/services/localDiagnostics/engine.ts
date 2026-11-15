import { computeMaps, greyFromRgba, measureHead, peakingFields, type Grey, type HeadPoint, type Region } from './compute';

export type PeakingField = 'outlines' | 'texture' | 'both';

/** Pixel work for one decoded image; runs inside the diagnostics worker or, without workers, in-thread. */
export class DiagnosticsCore {
    private grey: Grey | null = null;
    private fields: { outlines: Uint8Array; texture: Uint8Array } | null = null;

    load(bitmap: ImageBitmap) {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        this.grey = greyFromRgba(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        this.fields = null;
        return { width: canvas.width, height: canvas.height };
    }

    private image(): Grey {
        if (!this.grey) throw new Error('No image is loaded');
        return this.grey;
    }

    maps() { return computeMaps(this.image()); }

    peaking() {
        this.fields ??= peakingFields(this.image());
        const { outlines, texture } = this.fields;
        let marks = 0;
        for (let i = 0; i < outlines.length; i++) if (outlines[i] || texture[i]) marks++;
        return { marks };
    }

    /** Neutral white strokes with field alpha, like the backend artifact; design tokens supply the glow. */
    async peakingImage(mode: PeakingField): Promise<Blob> {
        const { width, height } = this.image();
        if (!this.fields) this.peaking();
        const { outlines, texture } = this.fields!;
        const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
        for (let i = 0; i < outlines.length; i++) {
            pixels[i * 4 + 3] = mode === 'outlines' ? outlines[i] : mode === 'texture' ? texture[i] : Math.max(outlines[i], texture[i]);
        }
        const canvas = new OffscreenCanvas(width, height);
        canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0);
        return canvas.convertToBlob({ type: 'image/png' });
    }

    head(points: HeadPoint[], region: Region) { return measureHead(this.image(), points, region); }
}

export type CoreOperation = 'load' | 'maps' | 'peaking' | 'peakingImage' | 'head';

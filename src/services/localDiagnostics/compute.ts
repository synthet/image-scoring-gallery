/**
 * Local port of the backend's `modules/visual_evidence/compute.py` (diagnostics-2.1).
 * Pure functions on grey Float32 images in display-luma units [0, 1], with OpenCV's
 * default reflect-101 borders, so golden values from the backend match within float error.
 */

export const EXTRACTOR_VERSION = 'diagnostics-2.1-local';
export const CELL_SIZE = 64;
export const PEAK_TILE = 512;
const MAD_NORMAL = 0.6744897501960817;
// Fixed display scales, shared across images; not calibrated quality grades.
export const FOCUS_DISPLAY_SCALE = .12;
export const NOISE_DISPLAY_SCALE = .08;
const OUTLINE_FLOOR = .012;
const TEXTURE_FLOOR = .010;

export interface Grey { data: Float32Array; width: number; height: number }

/** PIL `convert("L")` weights on 8-bit RGBA, then scaled to [0, 1] like `_grey`. */
export function greyFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Grey {
    const data = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i++, p += 4) {
        data[i] = ((rgba[p] * 19595 + rgba[p + 1] * 38470 + rgba[p + 2] * 7471 + 0x8000) >>> 16) / 255;
    }
    return { data, width, height };
}

export function crop(grey: Grey, x0: number, y0: number, x1: number, y1: number): Grey {
    const width = Math.max(0, x1 - x0), height = Math.max(0, y1 - y0);
    const data = new Float32Array(width * height);
    for (let y = 0; y < height; y++) data.set(grey.data.subarray((y0 + y) * grey.width + x0, (y0 + y) * grey.width + x0 + width), y * width);
    return { data, width, height };
}

function reflect101(p: number, length: number): number {
    if (length === 1) return 0;
    while (p < 0 || p >= length) p = p < 0 ? -p : 2 * length - 2 - p;
    return p;
}

/** Separable correlation: `kx` along rows, then `ky` along columns. */
function separable(src: Grey, kx: number[], ky: number[]): Float32Array {
    const { width, height, data } = src;
    const rx = (kx.length - 1) / 2, ry = (ky.length - 1) / 2;
    const rows = new Float32Array(width * height);
    const xIndex = new Int32Array(width + 2 * rx);
    for (let i = 0; i < xIndex.length; i++) xIndex[i] = reflect101(i - rx, width);
    for (let y = 0; y < height; y++) {
        const offset = y * width;
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let k = 0; k < kx.length; k++) sum += kx[k] * data[offset + xIndex[x + k]];
            rows[offset + x] = sum;
        }
    }
    const out = new Float32Array(width * height);
    const yIndex = new Int32Array(height + 2 * ry);
    for (let i = 0; i < yIndex.length; i++) yIndex[i] = reflect101(i - ry, height) * width;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let k = 0; k < ky.length; k++) sum += ky[k] * rows[yIndex[y + k] + x];
            out[y * width + x] = sum;
        }
    }
    return out;
}

const kernels = new Map<number, number[]>();
/** `cv2.getGaussianKernel` with OpenCV's float-depth size rule `round(sigma * 8 + 1) | 1`. */
function gaussianKernel(sigma: number): number[] {
    let kernel = kernels.get(sigma);
    if (!kernel) {
        const size = Math.round(sigma * 8 + 1) | 1;
        const scale = -0.5 / (sigma * sigma);
        kernel = Array.from({ length: size }, (_, i) => Math.exp(scale * (i - (size - 1) / 2) ** 2));
        const sum = kernel.reduce((a, b) => a + b, 0);
        kernel = kernel.map(value => value / sum);
        kernels.set(sigma, kernel);
    }
    return kernel;
}

function blur(grey: Grey, sigma: number): Grey {
    const kernel = gaussianKernel(sigma);
    return { data: separable(grey, kernel, kernel), width: grey.width, height: grey.height };
}

/** `hypot(Scharr dx, Scharr dy) / 32`. */
function gradient(grey: Grey): Float32Array {
    const gx = separable(grey, [-1, 0, 1], [3, 10, 3]);
    const gy = separable(grey, [3, 10, 3], [-1, 0, 1]);
    const out = new Float32Array(gx.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.hypot(gx[i] / 32, gy[i] / 32);
    return out;
}

function median(values: Float32Array): number {
    const sorted = Float32Array.from(values).sort();
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function std(values: ArrayLike<number>): number {
    let mean = 0;
    for (let i = 0; i < values.length; i++) mean += values[i];
    mean /= values.length;
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += (values[i] - mean) ** 2;
    return Math.sqrt(sum / values.length);
}

function correlation(x: ArrayLike<number>, y: ArrayLike<number>): number {
    let mx = 0, my = 0;
    for (let i = 0; i < x.length; i++) { mx += x[i]; my += y[i]; }
    mx /= x.length; my /= y.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) {
        const dx = x[i] - mx, dy = y[i] - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    return sxy / Math.sqrt(sxx * syy);
}

/** Haar diagonal-band MAD on low-structure pixels; reject correlated texture. */
export function noiseSigma(grey: Grey): number | null {
    const h = grey.height >> 1 << 1, w = grey.width >> 1 << 1;
    if (Math.min(h, w) < 8) return null;
    const dw = w / 2, dh = h / 2, src = grey.data, stride = grey.width;
    const detail = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const i = 2 * y * stride + 2 * x;
        detail[y * dw + x] = (src[i] - src[i + 1] - src[i + stride] + src[i + stride + 1]) / 2;
    }
    const structure = gradient(blur(grey, 1.2));
    const kept: number[] = [];
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        if (structure[2 * y * stride + 2 * x] < .02) kept.push(detail[y * dw + x]);
    }
    if (kept.length < 16) return null;
    const pairs: Array<[number[], number[]]> = [[[], []], [[], []]];
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const value = detail[y * dw + x];
        if (x + 1 < dw) { pairs[0][0].push(value); pairs[0][1].push(detail[y * dw + x + 1]); }
        if (y + 1 < dh) { pairs[1][0].push(value); pairs[1][1].push(detail[(y + 1) * dw + x]); }
    }
    for (const [x, y] of pairs) {
        if (x.length >= 16 && std(x) > 1e-5 && std(y) > 1e-5 && Math.abs(correlation(x, y)) > .35) return null;
    }
    const samples = Float32Array.from(kept);
    const centre = median(samples);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.abs(samples[i] - centre);
    return median(samples) / MAD_NORMAL;
}

/** Noise-corrected 4-neighbour Laplacian RMS, borders excluded. */
export function sharpness(grey: Grey, sigma: number | null = null): number | null {
    const { width, height, data } = grey;
    if (Math.min(width, height) < 3) return null;
    let sum = 0, squares = 0, count = 0;
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const value = data[i - width] + data[i + width] + data[i - 1] + data[i + 1] - 4 * data[i];
        sum += value; squares += value * value; count++;
    }
    const mean = sum / count;
    // The 4-neighbour Laplacian has sum-of-squared coefficients 20.
    return Math.sqrt(Math.max(0, squares / count - mean * mean - 20 * (sigma ?? 0) ** 2));
}

export interface LocalGrid {
    cells_x: number; cells_y: number; cell_size_px: number; x_edges: number[]; y_edges: number[];
    values: Array<number | null>; values_normalized: Array<number | null>;
    units: string; normalization: 'fixed_display_scale'; display_scale: number;
}

function edges(size: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < size; i += CELL_SIZE) out.push(i);
    out.push(size);
    return out;
}

export function computeMaps(grey: Grey): { sharpness: LocalGrid; noise: LocalGrid } {
    const xs = edges(grey.width), ys = edges(grey.height);
    const focus: Array<number | null> = [], noise: Array<number | null> = [];
    for (let y = 0; y + 1 < ys.length; y++) for (let x = 0; x + 1 < xs.length; x++) {
        const patch = crop(grey, xs[x], ys[y], xs[x + 1], ys[y + 1]);
        const sigma = noiseSigma(patch);
        focus.push(sharpness(patch, sigma));
        noise.push(sigma);
    }
    const grid = (values: Array<number | null>, scale: number, units: string): LocalGrid => ({
        cells_x: xs.length - 1, cells_y: ys.length - 1, cell_size_px: CELL_SIZE, x_edges: xs, y_edges: ys, values,
        values_normalized: values.map(value => value == null ? null : Math.min(1, Math.max(0, value / scale))),
        units, normalization: 'fixed_display_scale', display_scale: scale,
    });
    return { sharpness: grid(focus, FOCUS_DISPLAY_SCALE, 'noise_corrected_laplacian_rms'), noise: grid(noise, NOISE_DISPLAY_SCALE, 'display_luma_sigma') };
}

/** Outline and texture peaking strengths (0..255); "both" is their per-pixel maximum. */
export function peakingFields(grey: Grey): { outlines: Uint8Array; texture: Uint8Array } {
    const { width, height } = grey;
    const outlines = new Uint8Array(width * height), texture = new Uint8Array(width * height);
    const halo = 12;
    for (let y = 0; y < height; y += PEAK_TILE) for (let x = 0; x < width; x += PEAK_TILE) {
        const x0 = Math.max(0, x - halo), y0 = Math.max(0, y - halo);
        const x1 = Math.min(width, x + PEAK_TILE + halo), y1 = Math.min(height, y + PEAK_TILE + halo);
        const tile = crop(grey, x0, y0, x1, y1);
        const sigma = noiseSigma(tile) || 0;
        const edgeField = gradient(blur(tile, 1));
        const fine = blur(tile, .6).data, coarse = blur(tile, 1.6).data;
        const edgeFloor = Math.max(OUTLINE_FLOOR, sigma * .85), textureFloor = Math.max(TEXTURE_FLOOR, sigma * 1.5);
        const xEnd = Math.min(width, x + PEAK_TILE), yEnd = Math.min(height, y + PEAK_TILE);
        for (let ty = y; ty < yEnd; ty++) for (let tx = x; tx < xEnd; tx++) {
            const i = (ty - y0) * tile.width + (tx - x0);
            const o = ty * width + tx;
            outlines[o] = Math.round(Math.min(1, Math.max(0, (edgeField[i] - edgeFloor) / .12)) * 255);
            texture[o] = Math.round(Math.min(1, Math.max(0, (Math.abs(fine[i] - coarse[i]) - textureFloor) / .10)) * 255);
        }
    }
    return { outlines, texture };
}

export interface HeadPoint { name: string; x: number; y: number; confidence?: number; visible?: boolean }
export type Region = [number, number, number, number];

/** Python's `round()`: half to even. */
function roundHalfEven(value: number): number {
    const floor = Math.floor(value), fraction = value - floor;
    if (fraction > .5) return floor + 1;
    if (fraction < .5) return floor;
    return floor % 2 === 0 ? floor : floor + 1;
}

export function measureHead(grey: Grey, points: HeadPoint[], region: Region) {
    const { width, height } = grey;
    const [x0, y0, x1, y1] = region;
    const reliable = new Map<string, HeadPoint>();
    for (const p of points) {
        if ((p.confidence ?? 0) >= .8 && (p.visible ?? true) && x0 <= p.x && p.x <= x1 && y0 <= p.y && p.y <= y1) reliable.set(p.name, p);
    }
    const eyes = (['left_eye', 'right_eye'] as const).flatMap(name => reliable.get(name) ?? []);
    const anchors = [...eyes, ...(['beak', 'head_top'] as const).flatMap(name => reliable.get(name) ?? [])];
    if (!eyes.length || anchors.length < 2) return { state: 'unavailable' as const, reason: 'Reliable eyes and head landmarks are required' };
    const xs = anchors.map(p => p.x), ys = anchors.map(p => p.y);
    const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * .25;
    const head: Region = [Math.max(x0, Math.min(...xs) - pad), Math.max(y0, Math.min(...ys) - pad), Math.min(x1, Math.max(...xs) + pad), Math.min(y1, Math.max(...ys) + pad)];
    const left = Math.trunc(head[0] * width), top = Math.trunc(head[1] * height);
    const px = [left, top, Math.max(left + 1, Math.trunc(head[2] * width)), Math.max(top + 1, Math.trunc(head[3] * height))];
    const patch = crop(grey, px[0], px[1], Math.min(width, px[2]), Math.min(height, px[3]));
    const headSharpness = sharpness(patch, noiseSigma(patch));
    const small = px[2] - px[0] < 16 || px[3] - px[1] < 16;
    const side = Math.max(16, roundHalfEven((px[2] - px[0]) * .35));
    const half = Math.floor(side / 2);
    const measurements = eyes.map(point => {
        const cx = roundHalfEven(point.x * width), cy = roundHalfEven(point.y * height);
        const eye = crop(grey, Math.max(0, cx - half), Math.max(0, cy - half), Math.min(width, cx + half), Math.min(height, cy + half));
        const value = sharpness(eye, noiseSigma(eye));
        const ratio = !small && value != null && headSharpness && headSharpness > 1e-6 ? value / headSharpness : null;
        return { name: point.name, x: point.x, y: point.y, sharpness_ratio: ratio, evidence_confidence: point.confidence ?? 0,
            limitation: small ? 'small_head' : ratio == null ? 'low_contrast' : null };
    });
    const beak = reliable.get('beak');
    const facing = beak ? { x1: eyes.reduce((s, p) => s + p.x, 0) / eyes.length, y1: eyes.reduce((s, p) => s + p.y, 0) / eyes.length, x2: beak.x, y2: beak.y } : null;
    return { state: 'ready' as const, measurements: { head_bbox: head, facing_vector: facing, eyes: measurements, scope: 'primary_head' } };
}

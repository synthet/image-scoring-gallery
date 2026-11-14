import { describe, expect, it } from 'vitest';
import { computeMaps, crop, greyFromRgba, measureHead, noiseSigma, peakingFields, sharpness, type Grey } from './compute';
import golden from './golden.fixture.json';

// Same deterministic image as the golden generator (backend compute.py, OpenCV 4.12).
const W = 600, H = 200;
function pixel(x: number, y: number): number {
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const noise = (h >>> 24) % 13 - 6;
    const base = x < 400 ? 128 + ((Math.floor(x / 24) + Math.floor(y / 24)) % 2 ? 50 : -50) : 60 + Math.floor((x - 400) / 2) + Math.floor(y / 4);
    return Math.max(0, Math.min(255, base + noise));
}
const image: Grey = { width: W, height: H, data: new Float32Array(W * H) };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) image.data[y * W + x] = pixel(x, y) / 255;

const close = (actual: number | null, expected: number | null) => {
    if (expected == null) return expect(actual).toBeNull();
    expect(actual).not.toBeNull();
    expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(1e-5 + 1e-4 * Math.abs(expected));
};

describe('local diagnostics match backend compute.py', () => {
    it('uses PIL luma weights', () => {
        const grey = greyFromRgba(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 200, 90, 255]), 4, 1);
        // Values from Pillow's convert("L") on the same pixels.
        expect(Array.from(grey.data, value => Math.round(value * 255))).toEqual([76, 150, 29, 131]);
    });

    it('estimates noise and sharpness', () => {
        close(noiseSigma(image), golden.noise_sigma_whole);
        close(noiseSigma(crop(image, 0, 0, 300, H)), golden.noise_sigma_left);
        const cell = crop(image, 0, 0, 64, 64);
        close(sharpness(cell, noiseSigma(cell)), golden.sharpness_cell);
    });

    it('builds the sharpness and noise grids', () => {
        const maps = computeMaps(image);
        for (const layer of ['sharpness', 'noise'] as const) {
            const expected = golden.maps[layer];
            expect(maps[layer].x_edges).toEqual(expected.x_edges);
            expect(maps[layer].y_edges).toEqual(expected.y_edges);
            expect(maps[layer].values).toHaveLength(expected.values.length);
            maps[layer].values.forEach((value, index) => close(value, expected.values[index]));
        }
    });

    it('builds tiled peaking fields', () => {
        const { outlines, texture } = peakingFields(image);
        const both = outlines.map((value, index) => Math.max(value, texture[index]));
        for (const [mode, field] of [['outlines', outlines], ['texture', texture], ['both', both]] as const) {
            const expected = golden.peaking[mode];
            const sum = field.reduce((total, value) => total + value, 0);
            expect(Math.abs(sum - expected.sum) / expected.sum).toBeLessThan(1e-4);
            expect(Math.abs(field.filter(Boolean).length - expected.nonzero)).toBeLessThanOrEqual(expected.nonzero * 1e-3);
            golden.peaking_samples.forEach(([x, y], index) => expect(Math.abs(field[y * W + x] - expected.samples[index])).toBeLessThanOrEqual(1));
        }
    });

    it('measures eye detail relative to the head', () => {
        const result = measureHead(image, golden.head_points, [.1, .1, .6, .9]);
        expect(result.state).toBe('ready');
        if (result.state !== 'ready') return;
        const actual = result.measurements, expected = golden.head;
        actual.head_bbox.forEach((value, index) => close(value, expected.head_bbox[index]));
        expect(actual.facing_vector).toEqual(expected.facing_vector);
        expect(actual.eyes.map(eye => [eye.name, eye.limitation])).toEqual(expected.eyes.map(eye => [eye.name, eye.limitation]));
        actual.eyes.forEach((eye, index) => close(eye.sharpness_ratio, expected.eyes[index].sharpness_ratio));
    });

    it('reports unavailable head detail without reliable landmarks', () => {
        expect(measureHead(image, [{ name: 'left_eye', x: .2, y: .3, confidence: .9 }], [.1, .1, .6, .9]))
            .toEqual({ state: 'unavailable', reason: 'Reliable eyes and head landmarks are required' });
    });
});

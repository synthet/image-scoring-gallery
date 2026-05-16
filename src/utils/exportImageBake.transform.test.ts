import { describe, expect, it } from 'vitest';
import { applyOrientationTransform } from './exportImageBake';

describe('applyOrientationTransform', () => {
    it('applies EXIF orientation 3 (180°) via canvas transform', () => {
        const transforms: number[][] = [];
        const ctx = {
            transform(a: number, b: number, c: number, d: number, e: number, f: number) {
                transforms.push([a, b, c, d, e, f]);
            },
        } as unknown as CanvasRenderingContext2D;
        applyOrientationTransform(ctx, 3, 100, 200);
        expect(transforms).toEqual([[-1, 0, 0, -1, 100, 200]]);
    });

    it('applies EXIF orientation 6 (90° CW) via canvas transform', () => {
        const transforms: number[][] = [];
        const ctx = {
            transform(a: number, b: number, c: number, d: number, e: number, f: number) {
                transforms.push([a, b, c, d, e, f]);
            },
        } as unknown as CanvasRenderingContext2D;
        applyOrientationTransform(ctx, 6, 100, 200);
        expect(transforms).toEqual([[0, 1, -1, 0, 200, 0]]);
    });
});

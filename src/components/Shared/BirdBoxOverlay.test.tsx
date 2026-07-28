/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LABEL_COLORS } from '@synthet/image-scoring-design';
import { BirdBoxOverlay } from './BirdBoxOverlay';
import { birdBboxBorderCss } from './birdBboxStyle';

function parseRgba(css: string): { r: number; g: number; b: number; a: number } {
    const m = css.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
    if (!m) throw new Error(`expected rgba(...), got ${css}`);
    return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
    };
}

describe('birdBboxBorderCss', () => {
    it('maps conf 0 to label red with alpha 0.35', () => {
        const { r, g, b, a } = parseRgba(birdBboxBorderCss(0));
        const red = hexRgb(LABEL_COLORS.red);
        expect({ r, g, b }).toEqual(red);
        expect(a).toBeCloseTo(0.35, 5);
    });

    it('maps conf 0.5 to label yellow with mid alpha', () => {
        const { r, g, b, a } = parseRgba(birdBboxBorderCss(0.5));
        const yellow = hexRgb(LABEL_COLORS.yellow);
        expect({ r, g, b }).toEqual(yellow);
        expect(a).toBeCloseTo(0.675, 5);
    });

    it('maps conf 1 to label green with alpha 1', () => {
        const { r, g, b, a } = parseRgba(birdBboxBorderCss(1));
        const green = hexRgb(LABEL_COLORS.green);
        expect({ r, g, b }).toEqual(green);
        expect(a).toBeCloseTo(1, 5);
    });

    it('maps conf 0.25 to orange between red and yellow', () => {
        const { r, g } = parseRgba(birdBboxBorderCss(0.25));
        const red = hexRgb(LABEL_COLORS.red);
        const yellow = hexRgb(LABEL_COLORS.yellow);
        expect(g).toBeGreaterThan(red.g);
        expect(g).toBeLessThan(yellow.g);
        expect(r).toBeGreaterThanOrEqual(Math.min(red.r, yellow.r));
    });

    it('maps conf 0.75 to yellow-green between yellow and green', () => {
        const { r, g, b } = parseRgba(birdBboxBorderCss(0.75));
        const yellow = hexRgb(LABEL_COLORS.yellow);
        const green = hexRgb(LABEL_COLORS.green);
        expect(r).toBeLessThan(yellow.r);
        expect(r).toBeGreaterThan(green.r);
        expect(g).toBeGreaterThanOrEqual(Math.min(yellow.g, green.g));
        expect(b).toBeGreaterThanOrEqual(Math.min(yellow.b, green.b));
    });

    it('clamps out-of-range conf', () => {
        expect(birdBboxBorderCss(-1)).toBe(birdBboxBorderCss(0));
        expect(birdBboxBorderCss(2)).toBe(birdBboxBorderCss(1));
    });
});

describe('BirdBoxOverlay confidence border', () => {
    it('applies an rgba border from conf', () => {
        render(
            <BirdBoxOverlay
                bbox={{
                    x1: 10,
                    y1: 20,
                    x2: 110,
                    y2: 120,
                    conf: 0.9,
                    img_w: 200,
                    img_h: 200,
                }}
            />,
        );
        const overlay = screen.getByTestId('bird-bbox-overlay');
        expect(overlay.style.border).toContain('rgba(');
        expect(overlay.style.border).toBe(`2px solid ${birdBboxBorderCss(0.9)}`);
    });
});

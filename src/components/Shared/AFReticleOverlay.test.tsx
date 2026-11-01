/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AFReticleOverlay } from './AFReticleOverlay';
import type { AFMetadata } from '../../../electron/types';
import styles from './ImageOverlays.module.css';

describe('AFReticleOverlay', () => {
    it('returns null when af is null or undefined', () => {
        const { container } = render(<AFReticleOverlay af={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('returns null when af box has zero dimensions', () => {
        const af: AFMetadata = {
            box: { left: 0, top: 0, width: 0, height: 0, center_x: 0, center_y: 0 },
        };
        const { container } = render(<AFReticleOverlay af={af} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders locked focus reticle with correct percentage styles', () => {
        const af: AFMetadata = {
            version: '0400',
            mode: 'Single',
            in_focus: true,
            focus_distance_m: 0.45,
            box: {
                left: 0.48238,
                top: 0.47066,
                width: 0.03525,
                height: 0.05868,
                center_x: 0.5,
                center_y: 0.5,
            },
        };

        render(<AFReticleOverlay af={af} />);
        const el = screen.getByTestId('af-reticle-overlay');
        expect(el).toBeTruthy();
        expect(el.style.left).toBe('48.238%');
        expect(el.style.top).toBe('47.066%');
        expect(el.style.width).toBe('3.525%');
        expect(el.style.height).toBe('5.868%');
        expect(el.classList.contains(styles.focus)).toBe(true);
        expect(el.classList.contains(styles.locked)).toBe(true);

        expect(screen.getByText('AF · Single')).toBeTruthy();
        expect(screen.getByText('LOCKED')).toBeTruthy();
        expect(screen.getByText('0.45m')).toBeTruthy();
    });

    it('renders unconfirmed out-of-focus reticle with amber border', () => {
        const af: AFMetadata = {
            version: '0301',
            mode: 'Wide (L)',
            in_focus: false,
            box: {
                left: 0.1,
                top: 0.2,
                width: 0.3,
                height: 0.4,
                center_x: 0.25,
                center_y: 0.4,
            },
        };

        render(<AFReticleOverlay af={af} />);
        const el = screen.getByTestId('af-reticle-overlay');
        expect(el).toBeTruthy();
        expect(el.classList.contains(styles.focus)).toBe(true);
        expect(el.classList.contains(styles.locked)).toBe(false);
        expect(screen.getByText('AF · Wide (L)')).toBeTruthy();
        expect(screen.getByText('UNCONFIRMED')).toBeTruthy();
    });

    it('prefers crop_box over box when crop_box is provided', () => {
        const af: AFMetadata = {
            mode: 'Single',
            in_focus: true,
            box: { left: 0.1, top: 0.1, width: 0.1, height: 0.1, center_x: 0.15, center_y: 0.15 },
            crop_box: { left: 0.25, top: 0.35, width: 0.15, height: 0.25, center_x: 0.325, center_y: 0.475 },
        };

        render(<AFReticleOverlay af={af} />);
        const el = screen.getByTestId('af-reticle-overlay');
        expect(el.style.left).toBe('25%');
        expect(el.style.top).toBe('35%');
        expect(el.style.width).toBe('15%');
        expect(el.style.height).toBe('25%');
    });

    it('anchors the compact (grid) reticle at the AF center so tiny areas can grow to a visible minimum', () => {
        // DSC_1035: 152 px AF area on an 8256 x 5504 sensor, about 5 px on a grid thumbnail.
        const af: AFMetadata = {
            in_focus: false,
            box: { left: 0.40262, top: 0.33412, width: 0.01841, height: 0.02762, center_x: 0.41182, center_y: 0.34793 },
        };

        render(<AFReticleOverlay af={af} showDetails={false} />);
        const el = screen.getByTestId('af-reticle-overlay');
        expect(el.classList.contains(styles.compact)).toBe(true);
        expect(el.style.left).toBe('41.1825%');
        expect(el.style.top).toBe('34.793%');
        expect(el.style.width).toBe('1.841%');
        expect(el.style.height).toBe('2.762%');
        expect(screen.queryByText(/AF ·/)).toBeNull();
    });

    it('keeps the full reticle anchored at its top-left corner', () => {
        const af: AFMetadata = { box: { left: 0.1, top: 0.2, width: 0.3, height: 0.4, center_x: 0.25, center_y: 0.4 } };
        render(<AFReticleOverlay af={af} />);
        const el = screen.getByTestId('af-reticle-overlay');
        expect(el.classList.contains(styles.compact)).toBe(false);
        expect(el.style.left).toBe('10%');
    });
});

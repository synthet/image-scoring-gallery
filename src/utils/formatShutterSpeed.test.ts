import { describe, it, expect } from 'vitest';
import { formatShutterSpeedDisplay } from './formatShutterSpeed';

describe('formatShutterSpeedDisplay', () => {
    it('converts decimal seconds to a fraction', () => {
        expect(formatShutterSpeedDisplay('0.004921259843')).toBe('1/203s');
        expect(formatShutterSpeedDisplay(0.005)).toBe('1/200s');
    });

    it('preserves fraction form including spaced slash', () => {
        expect(formatShutterSpeedDisplay('1/600')).toBe('1/600s');
        expect(formatShutterSpeedDisplay('1 / 250')).toBe('1/250s');
    });

    it('formats long exposures as seconds', () => {
        expect(formatShutterSpeedDisplay('2')).toBe('2s');
        expect(formatShutterSpeedDisplay(2)).toBe('2s');
        expect(formatShutterSpeedDisplay('1.5')).toBe('1.5s');
    });
});

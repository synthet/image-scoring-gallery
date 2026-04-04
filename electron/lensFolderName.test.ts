import { describe, expect, it } from 'vitest';
import { normalizeLensFolderName, sanitizeLensName, UNKNOWN_LENS_FOLDER } from './lensFolderName';

describe('normalizeLensFolderName', () => {
    it('extracts focal range from Nikon marketing string', () => {
        expect(normalizeLensFolderName('NIKKOR Z 180-600mm f/5.6-6.3 VR')).toBe('180-600mm');
    });

    it('handles sanitized slash like EXIF folder names', () => {
        expect(normalizeLensFolderName('NIKKOR Z 180-600mm f_5.6-6.3 VR')).toBe('180-600mm');
    });

    it('normalizes prime lenses', () => {
        expect(normalizeLensFolderName('NIKKOR Z 105mm f/2.8')).toBe('105mm');
    });

    it('normalizes decimal focal length (parity with move_misplaced_by_lens.py)', () => {
        expect(normalizeLensFolderName('Some 10.5mm lens')).toBe('10.5mm');
    });

    it('normalizes common zoom token', () => {
        expect(normalizeLensFolderName('24-70mm f/2.8')).toBe('24-70mm');
    });

    it('returns _unknown_lens when missing', () => {
        expect(normalizeLensFolderName(null)).toBe(UNKNOWN_LENS_FOLDER);
        expect(normalizeLensFolderName(undefined)).toBe(UNKNOWN_LENS_FOLDER);
        expect(normalizeLensFolderName('')).toBe(UNKNOWN_LENS_FOLDER);
        expect(normalizeLensFolderName('   ')).toBe(UNKNOWN_LENS_FOLDER);
    });

    it('falls back to sanitizeLensName when no mm token', () => {
        expect(normalizeLensFolderName('FTZ Adapter')).toBe('FTZ Adapter');
    });

    it('falls back for invalid 0mm token', () => {
        expect(normalizeLensFolderName('0mm')).toBe(sanitizeLensName('0mm'));
    });
});

describe('sanitizeLensName', () => {
    it('replaces illegal path characters', () => {
        expect(sanitizeLensName('a/b:c')).toBe('a_b_c');
    });
});

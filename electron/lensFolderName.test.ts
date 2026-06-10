import { describe, expect, it } from 'vitest';
import {
    formatFocalToken,
    normalizeLensFolderName,
    parseNikonLensQuad,
    sanitizeLensName,
    UNKNOWN_LENS_FOLDER,
} from './lensFolderName';

/** Keep cases aligned with image-scoring-backend/tests/test_lens_folder_name.py */
describe('normalizeLensFolderName', () => {
    const cases: [string | null | undefined, string][] = [
        ['NIKKOR Z 180-600mm f/5.6-6.3 VR', '180-600mm'],
        ['NIKKOR Z 180-600mm f_5.6-6.3 VR', '180-600mm'],
        ['NIKKOR Z 105mm f/2.8', '105mm'],
        ['Some 10.5mm lens', '10.5mm'],
        ['24-70mm f/2.8', '24-70mm'],
        ['NIKKOR 35mm f/1.8', '35mm'],
        ['35 35 1.8 1.8', '35mm'],
        ['35 35 2 2', '35mm'],
        ['50 50 1.4 1.4', '50mm'],
        ['50 50 1.8 1.8', '50mm'],
        ['28 105 3.5 4.5', '28-105mm'],
        ['28 70 2.8 2.8', '28-70mm'],
        ['10.5 10.5 2.8 2.8', '10.5mm'],
        [null, UNKNOWN_LENS_FOLDER],
        [undefined, UNKNOWN_LENS_FOLDER],
        ['', UNKNOWN_LENS_FOLDER],
        ['   ', UNKNOWN_LENS_FOLDER],
        ['FTZ Adapter', 'FTZ Adapter'],
    ];

    it.each(cases)('%s → %s', (raw, expected) => {
        expect(normalizeLensFolderName(raw)).toBe(expected);
    });

    it('falls back for invalid 0mm token', () => {
        expect(normalizeLensFolderName('0mm')).toBe(sanitizeLensName('0mm'));
    });
});

describe('parseNikonLensQuad', () => {
    it('returns null for non-quad strings', () => {
        expect(parseNikonLensQuad('NIKKOR 35mm f/1.8')).toBeNull();
        expect(parseNikonLensQuad('FTZ Adapter')).toBeNull();
    });
});

describe('formatFocalToken', () => {
    it('formats integers without decimal', () => {
        expect(formatFocalToken(35)).toBe('35');
        expect(formatFocalToken(10.5)).toBe('10.5');
    });
});

describe('sanitizeLensName', () => {
    it('replaces illegal path characters', () => {
        expect(sanitizeLensName('a/b:c')).toBe('a_b_c');
    });
});

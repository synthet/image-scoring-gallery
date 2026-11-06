import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { captureKey } from './captureKey';

interface Vector {
    name: string;
    model: string | null;
    shutter_count: number | string | null;
    date_time_original: string | null;
    expected: string | null;
}

/** Byte-identical copy of the pipeline's fixture; the format is a contract between the repos. */
const vectors = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'capture_key_vectors.json'), 'utf8'),
) as Vector[];

describe('captureKey', () => {
    it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
        expect(captureKey(v.model, v.shutter_count, v.date_time_original)).toBe(v.expected);
    });

    it('prefers the raw value of an exiftool date object', () => {
        const date = { rawValue: '2026:01:19 14:56:04.52-06:00', toString: () => '2026-01-19T20:56:04Z' };
        expect(captureKey('NIKON Z 8', 12345, date)).toBe('NIKON Z 8|12345|2026-01-19T14:56:04');
    });

    it('falls back to the string form of a date object', () => {
        const date = { toString: () => '2026-01-19T14:56:04.520-06:00' };
        expect(captureKey('NIKON Z 8', 12345, date)).toBe('NIKON Z 8|12345|2026-01-19T14:56:04');
    });

    it('rejects an impossible date', () => {
        expect(captureKey('NIKON Z 8', 12345, '2026:02:31 14:56:04')).toBeNull();
    });

    it('rejects a fractional shutter count', () => {
        expect(captureKey('NIKON Z 8', 12.5, '2026:01:19 14:56:04')).toBeNull();
    });
});

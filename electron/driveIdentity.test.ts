import { describe, it, expect } from 'vitest';
import {
    normalizeSerial,
    computeDriveId,
    driveLetterOf,
    pathFallbackIdentity,
    parseVolumeProbe,
} from './driveIdentity';

describe('normalizeSerial', () => {
    it('trims, strips inner whitespace, upper-cases', () => {
        expect(normalizeSerial('  57x8 n abc ')).toBe('57X8NABC');
    });
    it('treats blank / all-zero / none as absent', () => {
        expect(normalizeSerial('')).toBeUndefined();
        expect(normalizeSerial('   ')).toBeUndefined();
        expect(normalizeSerial('0')).toBeUndefined();
        expect(normalizeSerial('00000000')).toBeUndefined();
        expect(normalizeSerial('none')).toBeUndefined();
        expect(normalizeSerial(null)).toBeUndefined();
        expect(normalizeSerial(undefined)).toBeUndefined();
    });
});

describe('computeDriveId', () => {
    it('prefers the disk serial', () => {
        expect(computeDriveId('57X8N123', '1A2B3C4D')).toEqual({
            driveId: '57X8N123',
            source: 'disk-serial',
        });
    });
    it('falls back to VOL-<volumeSerial> when disk serial is blank/all-zero', () => {
        expect(computeDriveId('00000000', '1A2B3C4D')).toEqual({
            driveId: 'VOL-1A2B3C4D',
            source: 'volume-serial',
        });
        expect(computeDriveId(null, '1a2b3c4d')).toEqual({
            driveId: 'VOL-1A2B3C4D',
            source: 'volume-serial',
        });
    });
    it('returns null when neither serial is usable', () => {
        expect(computeDriveId('0', '   ')).toBeNull();
        expect(computeDriveId(null, null)).toBeNull();
    });
});

describe('driveLetterOf', () => {
    it('extracts and upper-cases the drive letter', () => {
        expect(driveLetterOf('e:\\DCIM\\100')).toBe('E:');
        expect(driveLetterOf('E:')).toBe('E:');
    });
    it('returns null for non-drive-letter paths', () => {
        expect(driveLetterOf('/mnt/e/DCIM')).toBeNull();
        expect(driveLetterOf('\\\\server\\share')).toBeNull();
    });
});

describe('pathFallbackIdentity', () => {
    it('builds a stable path id and marks the source', () => {
        expect(pathFallbackIdentity('E:\\')).toEqual({
            driveId: 'PATH-E:',
            source: 'path-fallback',
        });
    });
});

describe('parseVolumeProbe', () => {
    it('builds identity from disk serial, keeping label/fs', () => {
        const json = JSON.stringify({
            volumeSerial: '1A2B3C4D',
            diskSerial: '57X8N123',
            label: 'Z8 card',
            fs: 'exFAT',
        });
        expect(parseVolumeProbe(json, 'E:')).toEqual({
            driveId: '57X8N123',
            source: 'disk-serial',
            diskSerial: '57X8N123',
            volumeSerial: '1A2B3C4D',
            volumeLabel: 'Z8 card',
            fsType: 'exFAT',
        });
    });
    it('falls back to volume serial when disk serial is blank', () => {
        const json = JSON.stringify({ volumeSerial: '1A2B3C4D', diskSerial: '  ', label: null, fs: null });
        const id = parseVolumeProbe(json, 'E:');
        expect(id.driveId).toBe('VOL-1A2B3C4D');
        expect(id.source).toBe('volume-serial');
        expect(id.diskSerial).toBeUndefined();
    });
    it('degrades to a path id when both serials are blank', () => {
        const json = JSON.stringify({ volumeSerial: '0', diskSerial: '00000000', label: null, fs: null });
        expect(parseVolumeProbe(json, 'E:\\')).toEqual({ driveId: 'PATH-E:', source: 'path-fallback' });
    });
    it('degrades to a path id on malformed JSON', () => {
        expect(parseVolumeProbe('not json', 'E:\\')).toEqual({ driveId: 'PATH-E:', source: 'path-fallback' });
    });
});

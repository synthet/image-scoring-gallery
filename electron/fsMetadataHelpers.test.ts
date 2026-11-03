import { describe, expect, it } from 'vitest';
import { isServableMediaPath, parseAfMetadataFromTags } from './fsMetadataHelpers';

const z8Tags = {
    AFInfo2Version: '0400',
    AFAreaMode: 197,
    AFImageWidth: 8256,
    AFImageHeight: 5504,
    AFAreaXPosition: 4128,
    AFAreaYPosition: 2752,
    AFAreaWidth: 826,
    AFAreaHeight: 550,
    FocusResult: 1,
};

describe('parseAfMetadataFromTags', () => {
    it('normalizes the AF area to a box', () => {
        const af = parseAfMetadataFromTags(z8Tags);
        expect(af?.box?.width).toBeCloseTo(826 / 8256);
        expect(af?.in_focus).toBe(true);
    });

    it('accepts AFCoordinatesAvailable when it is 1 or "Yes"', () => {
        expect(parseAfMetadataFromTags({ ...z8Tags, AFCoordinatesAvailable: 1 })).not.toBeNull();
        expect(parseAfMetadataFromTags({ ...z8Tags, AFCoordinatesAvailable: 'Yes' })).not.toBeNull();
    });

    it('returns null when the camera says the AF coordinates are not valid (backend parity)', () => {
        expect(parseAfMetadataFromTags({ ...z8Tags, AFCoordinatesAvailable: 0 })).toBeNull();
        expect(parseAfMetadataFromTags({ ...z8Tags, AFCoordinatesAvailable: 'No' })).toBeNull();
    });
});

describe('isServableMediaPath (#224)', () => {
    it('serves image and RAW files, in any letter case', () => {
        expect(isServableMediaPath('D:/Photos/2026/DSC_0001.JPG')).toBe(true);
        expect(isServableMediaPath('/mnt/d/Photos/DSC_0002.nef')).toBe(true);
        expect(isServableMediaPath('C:/thumbs/ab/abc.webp')).toBe(true);
    });

    it('refuses everything else, including traversal to a non-image file', () => {
        expect(isServableMediaPath('C:/Users/me/AppData/notes.txt')).toBe(false);
        expect(isServableMediaPath('D:/Photos/../outside.txt')).toBe(false);
        expect(isServableMediaPath('C:/Windows/System32/calc.exe')).toBe(false);
        expect(isServableMediaPath('C:/project/data.json')).toBe(false);
        expect(isServableMediaPath('C:/Photos/noextension')).toBe(false);
    });
});

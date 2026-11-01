import { describe, expect, it } from 'vitest';
import { parseAfMetadataFromTags } from './fsMetadataHelpers';

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

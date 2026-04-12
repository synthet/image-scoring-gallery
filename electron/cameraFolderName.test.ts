import { describe, expect, it } from 'vitest';
import { cameraFolderFromExifModel } from './cameraFolderName';

/** Keep cases aligned with image-scoring-backend/tests/test_camera_folder_name.py */
describe('cameraFolderFromExifModel', () => {
    const cases: [string | null | undefined, string][] = [
        [undefined, 'unknown'],
        [null, 'unknown'],
        ['', 'unknown'],
        ['unknown', 'unknown'],
        ['Nikon Z 8', 'Z8'],
        ['NIKON Z 6 II', 'Z6ii'],
        ['NIKON Z 6_2', 'Z6ii'],
        ['nikon z 6', 'Z6ii'],
        ['NIKON D300', 'D300'],
        ['Nikon D90', 'D90'],
        ['D500', 'D500'],
        ['Canon EOS R5', 'R5'],
        ['NIKON D800E', 'D800'],
    ];

    it.each(cases)('%s → %s', (model, expected) => {
        expect(cameraFolderFromExifModel(model)).toBe(expected);
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportOriginals } from './exportOriginals';

describe('exportOriginals (#239)', () => {
    let root: string;
    let dest: string;
    const allowAll = async () => true;

    function photo(folder: string, name: string, bytes = `${folder}/${name}`): string {
        const dir = path.join(root, folder);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name);
        fs.writeFileSync(file, bytes);
        return file;
    }

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'export-originals-'));
        dest = path.join(root, 'out');
        fs.mkdirSync(dest);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('copies each photo byte for byte and leaves the source in place', async () => {
        const a = photo('card', 'a.nef');
        const b = photo('card', 'b.jpg');
        const result = await exportOriginals([a, b], dest, { isGalleryFile: allowAll });
        expect(result).toEqual({ total: 2, copied: 2, failed: [], cancelled: false });
        expect(fs.readFileSync(path.join(dest, 'a.nef'), 'utf8')).toBe('card/a.nef');
        expect(fs.readFileSync(path.join(dest, 'b.jpg'), 'utf8')).toBe('card/b.jpg');
        expect(fs.existsSync(a)).toBe(true);
    });

    it('never overwrites: an existing file and a same-named photo both get new names', async () => {
        fs.writeFileSync(path.join(dest, 'a.nef'), 'already here');
        const result = await exportOriginals([photo('one', 'a.nef'), photo('two', 'a.nef')], dest, { isGalleryFile: allowAll });
        expect(result.copied).toBe(2);
        expect(fs.readFileSync(path.join(dest, 'a.nef'), 'utf8')).toBe('already here');
        expect(fs.readFileSync(path.join(dest, 'a (2).nef'), 'utf8')).toBe('one/a.nef');
        expect(fs.readFileSync(path.join(dest, 'a (3).nef'), 'utf8')).toBe('two/a.nef');
    });

    it('refuses a file that does not belong to the gallery', async () => {
        const inside = photo('card', 'a.nef');
        const outside = photo('private', 'b.nef');
        const result = await exportOriginals([inside, outside], dest, { isGalleryFile: async (f) => f === inside });
        expect(result.copied).toBe(1);
        expect(result.failed).toEqual([{ file: outside, error: 'Not a gallery file' }]);
        expect(fs.existsSync(path.join(dest, 'b.nef'))).toBe(false);
    });

    it('reports a failed copy and carries on with the rest', async () => {
        const missing = path.join(root, 'card', 'gone.nef');
        const result = await exportOriginals([missing, photo('card', 'a.nef')], dest, { isGalleryFile: allowAll });
        expect(result.copied).toBe(1);
        expect(result.failed.map((f) => f.file)).toEqual([missing]);
        expect(fs.readdirSync(dest)).toEqual(['a.nef']);
    });

    it('stops between files on cancel and leaves only whole copies', async () => {
        const files = ['a', 'b', 'c'].map((n) => photo('card', `${n}.nef`));
        const controller = new AbortController();
        const result = await exportOriginals(files, dest, {
            isGalleryFile: allowAll,
            signal: controller.signal,
            onProgress: (current) => { if (current === 1) controller.abort(); },
        });
        expect(result).toMatchObject({ total: 3, copied: 1, cancelled: true });
        expect(fs.readdirSync(dest)).toEqual(['a.nef']);
    });

    it('reports progress after every file', async () => {
        const onProgress = vi.fn();
        await exportOriginals([photo('card', 'a.nef'), photo('card', 'b.nef')], dest, { isGalleryFile: allowAll, onProgress });
        expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
    });
});

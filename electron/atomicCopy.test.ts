import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileAtomic } from './atomicCopy';

describe('copyFileAtomic (#238)', () => {
    let dir: string;
    const file = (name: string) => path.join(dir, name);

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-copy-'));
        fs.writeFileSync(file('source.nef'), 'photo bytes');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('copies the file and leaves no .part behind', async () => {
        await copyFileAtomic(file('source.nef'), file('dest.nef'));
        expect(fs.readFileSync(file('dest.nef'), 'utf8')).toBe('photo bytes');
        expect(fs.existsSync(file('dest.nef.part'))).toBe(false);
    });

    it('replaces a .part left by an earlier crash', async () => {
        fs.writeFileSync(file('dest.nef.part'), 'trunc');
        await copyFileAtomic(file('source.nef'), file('dest.nef'));
        expect(fs.readFileSync(file('dest.nef'), 'utf8')).toBe('photo bytes');
        expect(fs.existsSync(file('dest.nef.part'))).toBe(false);
    });

    it('leaves neither the destination nor a .part when the copy fails', async () => {
        await expect(copyFileAtomic(file('missing.nef'), file('dest.nef'))).rejects.toThrow();
        expect(fs.existsSync(file('dest.nef'))).toBe(false);
        expect(fs.existsSync(file('dest.nef.part'))).toBe(false);
    });

    it('removes the .part when the final rename fails, and the destination never appears', async () => {
        vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('disk gone'));
        await expect(copyFileAtomic(file('source.nef'), file('dest.nef'))).rejects.toThrow('disk gone');
        expect(fs.existsSync(file('dest.nef'))).toBe(false);
        expect(fs.existsSync(file('dest.nef.part'))).toBe(false);
    });
});

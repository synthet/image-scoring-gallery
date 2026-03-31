import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    normalizeFsPathForCache,
    isDirPathUnderCacheRoot,
    parentDirNormalized,
    readFsDirCached,
    invalidateFsReadDirCacheForFolder,
    __clearFsReadDirCacheForTests,
    type FsReadDirResult,
} from './fsReadDirCache';

const emptyResult = (dirPath: string): FsReadDirResult => ({
    dirPath,
    directories: [],
    images: [],
    totalImageCount: 0,
    rootPath: '/root',
});

describe('normalizeFsPathForCache', () => {
    it('trims and strips trailing separators', () => {
        expect(normalizeFsPathForCache('D:\\Photos\\\\')).toBe('D:/Photos');
        expect(normalizeFsPathForCache('  /mnt/d/x/  ')).toBe('/mnt/d/x');
    });
});

describe('isDirPathUnderCacheRoot', () => {
    it('matches self and descendants case-insensitively', () => {
        expect(isDirPathUnderCacheRoot('D:/Photos', 'D:/Photos')).toBe(true);
        expect(isDirPathUnderCacheRoot('D:/Photos/a', 'D:/photos')).toBe(true);
        expect(isDirPathUnderCacheRoot('D:/PhotosBackup', 'D:/Photos')).toBe(false);
        expect(isDirPathUnderCacheRoot('D:/Photo', 'D:/Photos')).toBe(false);
    });
});

describe('parentDirNormalized', () => {
    it('returns normalized parent or null at drive root', () => {
        expect(parentDirNormalized('D:/Photos/a')).toBe('D:/Photos');
        expect(parentDirNormalized('D:/Photos')).toBe(null);
    });
});

describe('readFsDirCached + invalidateFsReadDirCacheForFolder', () => {
    beforeEach(() => {
        __clearFsReadDirCacheForTests();
    });

    it('caches by path offset limit kinds', async () => {
        const readFn = vi.fn().mockResolvedValue(emptyResult('D:/a'));
        await readFsDirCached(readFn, { dirPath: 'D:\\a\\', offset: 0, limit: 80 });
        await readFsDirCached(readFn, { dirPath: 'D:/a', offset: 0, limit: 80 });
        expect(readFn).toHaveBeenCalledTimes(1);
    });

    it('misses cache for different pages', async () => {
        const readFn = vi
            .fn()
            .mockResolvedValueOnce(emptyResult('D:/a'))
            .mockResolvedValueOnce(emptyResult('D:/a'));
        await readFsDirCached(readFn, { dirPath: 'D:/a', offset: 0, limit: 80 });
        await readFsDirCached(readFn, { dirPath: 'D:/a', offset: 80, limit: 80 });
        expect(readFn).toHaveBeenCalledTimes(2);
    });

    it('invalidate removes folder and subtree keys', async () => {
        const readFn = vi.fn().mockImplementation(async (args: { dirPath: string }) =>
            emptyResult(args.dirPath),
        );
        await readFsDirCached(readFn, { dirPath: 'D:/Photos', offset: 0, limit: 80 });
        await readFsDirCached(readFn, { dirPath: 'D:/Photos/sub', offset: 0, limit: 80 });
        await readFsDirCached(readFn, { dirPath: 'D:/Other', offset: 0, limit: 80 });
        expect(readFn).toHaveBeenCalledTimes(3);

        invalidateFsReadDirCacheForFolder('D:/Photos');

        await readFsDirCached(readFn, { dirPath: 'D:/Photos', offset: 0, limit: 80 });
        await readFsDirCached(readFn, { dirPath: 'D:/Photos/sub', offset: 0, limit: 80 });
        await readFsDirCached(readFn, { dirPath: 'D:/Other', offset: 0, limit: 80 });
        expect(readFn).toHaveBeenCalledTimes(5);
    });
});

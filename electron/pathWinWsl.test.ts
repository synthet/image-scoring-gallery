import { describe, expect, it } from 'vitest';
import {
    crossOsFilePathCandidates,
    toWindowsLocalFsPath,
    windowsDriveToWslMountPath,
} from './pathWinWsl';

const win = { forPlatform: 'win32' as const };

describe('toWindowsLocalFsPath', () => {
    it('converts pure WSL /mnt/d/... on Windows', () => {
        expect(toWindowsLocalFsPath('/mnt/d/Photos/a.NEF', win)).toBe('D:/Photos/a.NEF');
    });

    it('repairs hybrid D:/mnt/d/...', () => {
        expect(toWindowsLocalFsPath('D:/mnt/d/Photos/a.NEF', win)).toBe('D:/Photos/a.NEF');
    });

    it('repairs hybrid D:\\mnt\\d\\...', () => {
        expect(toWindowsLocalFsPath(String.raw`D:\mnt\d\Photos\a.NEF`, win)).toBe('D:/Photos/a.NEF');
    });

    it('uses /mnt/<letter>/ as authoritative drive when it disagrees with leading X:', () => {
        expect(toWindowsLocalFsPath('D:/mnt/c/Users/x/a.jpg', win)).toBe('C:/Users/x/a.jpg');
    });

    it('leaves already-correct Windows paths unchanged', () => {
        expect(toWindowsLocalFsPath('D:/Photos/a.NEF', win)).toBe('D:/Photos/a.NEF');
    });

    it('returns path unchanged on non-win32 even for WSL-shaped strings', () => {
        expect(toWindowsLocalFsPath('/mnt/d/Photos/a.NEF', { forPlatform: 'linux' })).toBe(
            '/mnt/d/Photos/a.NEF',
        );
    });
});

describe('windowsDriveToWslMountPath', () => {
    it('maps D:/... to /mnt/d/...', () => {
        expect(windowsDriveToWslMountPath('D:/Photos/a.NEF')).toBe('/mnt/d/Photos/a.NEF');
    });

    it('maps backslashes', () => {
        expect(windowsDriveToWslMountPath(String.raw`D:\Photos\a.NEF`)).toBe('/mnt/d/Photos/a.NEF');
    });

    it('leaves /mnt paths unchanged', () => {
        expect(windowsDriveToWslMountPath('/mnt/d/Photos/a.NEF')).toBe('/mnt/d/Photos/a.NEF');
    });
});

describe('crossOsFilePathCandidates', () => {
    it('on win32 includes D: form for /mnt/d DB paths', () => {
        const list = crossOsFilePathCandidates('/mnt/d/Photos/Z8/a.NEF', { forPlatform: 'win32' });
        expect(list).toContain('/mnt/d/Photos/Z8/a.NEF');
        expect(list).toContain('D:/Photos/Z8/a.NEF');
    });

    it('on linux includes /mnt form for Windows DB paths', () => {
        const list = crossOsFilePathCandidates(String.raw`D:\Photos\a.NEF`, { forPlatform: 'linux' });
        expect(list).toContain(String.raw`D:\Photos\a.NEF`);
        expect(list).toContain('/mnt/d/Photos/a.NEF');
    });
});

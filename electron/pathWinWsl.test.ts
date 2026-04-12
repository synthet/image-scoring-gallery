import { describe, expect, it } from 'vitest';
import { toWindowsLocalFsPath } from './pathWinWsl';

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

import { describe, it, expect, afterEach } from 'vitest';
import { pickServerFilesystemPath } from './pickServerFilesystemPath';

describe('pickServerFilesystemPath', () => {
    afterEach(() => {
        delete (window as unknown as { electron?: unknown }).electron;
    });

    it('browser: prefers POSIX file_path over win_path', () => {
        expect(
            pickServerFilesystemPath(
                '/mnt/d/Photos/Z8/x.NEF',
                'D:\\Photos\\Z8\\x.NEF',
            ),
        ).toBe('/mnt/d/Photos/Z8/x.NEF');
    });

    it('electron: prefers win_path', () => {
        (window as unknown as { electron: Record<string, unknown> }).electron = {};
        expect(
            pickServerFilesystemPath(
                '/mnt/d/Photos/Z8/x.NEF',
                'D:\\Photos\\Z8\\x.NEF',
            ),
        ).toBe('D:\\Photos\\Z8\\x.NEF');
    });

    it('browser: falls back to win_path when file_path is empty', () => {
        expect(pickServerFilesystemPath('', 'D:\\a.NEF')).toBe('D:\\a.NEF');
    });
});

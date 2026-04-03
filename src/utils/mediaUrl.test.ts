import { describe, it, expect, afterEach } from 'vitest';
import { toMediaUrl } from './mediaUrl';

describe('toMediaUrl', () => {
    afterEach(() => {
        delete (window as unknown as { electron?: unknown }).electron;
    });

    it('browser mode encodes path under /media/', () => {
        expect(toMediaUrl('D:/a b.jpg')).toBe('/media/' + encodeURIComponent('D:/a b.jpg'));
    });

    it('electron Windows drive uses media:/// and forward slashes', () => {
        (window as unknown as { electron: Record<string, unknown> }).electron = {};
        expect(toMediaUrl('D:/Photos/a.jpg')).toBe('media:///D:/Photos/a.jpg');
        expect(toMediaUrl('D:\\Photos\\a.jpg')).toBe('media:///D:/Photos/a.jpg');
    });

    it('electron mnt path uses media:///', () => {
        (window as unknown as { electron: Record<string, unknown> }).electron = {};
        expect(toMediaUrl('/mnt/c/Projects/x.jpg')).toBe('media:///mnt/c/Projects/x.jpg');
    });
});

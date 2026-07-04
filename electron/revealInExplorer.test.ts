import { describe, expect, it, vi, beforeEach } from 'vitest';

const { showItemInFolder } = vi.hoisted(() => ({
    showItemInFolder: vi.fn(),
}));

vi.mock('electron', () => ({
    shell: { showItemInFolder },
}));

import { revealInExplorer } from './revealInExplorer';

const win = { forPlatform: 'win32' as const };

describe('revealInExplorer', () => {
    beforeEach(() => {
        showItemInFolder.mockClear();
    });

    it('normalizes WSL paths and calls shell.showItemInFolder on Windows', () => {
        revealInExplorer('/mnt/d/Photos/DSC_0001.NEF', win);
        expect(showItemInFolder).toHaveBeenCalledWith('D:/Photos/DSC_0001.NEF');
    });

    it('passes through plain Windows paths', () => {
        revealInExplorer('D:/Photos/DSC_0001.NEF', win);
        expect(showItemInFolder).toHaveBeenCalledWith('D:/Photos/DSC_0001.NEF');
    });

    it('throws when path is empty', () => {
        expect(() => revealInExplorer('')).toThrow('Path is required');
        expect(showItemInFolder).not.toHaveBeenCalled();
    });

    it('throws when path is not absolute after normalization', () => {
        expect(() => revealInExplorer('relative/photo.NEF', win)).toThrow('Path must be absolute');
        expect(showItemInFolder).not.toHaveBeenCalled();
    });
});

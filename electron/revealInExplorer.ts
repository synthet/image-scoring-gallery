import path from 'path';
import { shell } from 'electron';
import { toWindowsLocalFsPath, type ToWindowsLocalFsPathOptions } from './pathWinWsl';

/**
 * Open the system file manager and select the given file (or folder path).
 * Normalizes WSL/hybrid DB paths on Windows before calling shell.showItemInFolder.
 */
export function revealInExplorer(filePath: string, opts?: ToWindowsLocalFsPathOptions): void {
    const trimmed = typeof filePath === 'string' ? filePath.trim() : '';
    if (!trimmed) {
        throw new Error('Path is required');
    }

    const normalized = toWindowsLocalFsPath(trimmed, opts);
    if (!path.isAbsolute(normalized)) {
        throw new Error('Path must be absolute');
    }

    shell.showItemInFolder(normalized);
}

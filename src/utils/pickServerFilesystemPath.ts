/**
 * Choose which absolute path to use for /media URLs, RAW preview fetch, and server-side file ops.
 * Electron prefers Windows paths when present; browser + Docker must use POSIX paths from the DB
 * (`/mnt/...`, `/app/...`) so the gallery Express server can open the mounted volume.
 */
export function pickServerFilesystemPath(
    filePath: string | null | undefined,
    winPath: string | null | undefined,
): string {
    const fp = typeof filePath === 'string' ? filePath.trim() : '';
    const wp = typeof winPath === 'string' ? winPath.trim() : '';

    const isElectron =
        typeof window !== 'undefined' &&
        !!(window as unknown as { electron?: unknown }).electron;

    if (isElectron) {
        return wp || fp;
    }

    if (fp.startsWith('/')) {
        return fp;
    }

    return fp || wp;
}

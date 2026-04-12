/**
 * Normalize paths from the DB (WSL, hybrid `D:/mnt/d/...`, or plain Windows) for Node fs on Windows.
 */

export type ToWindowsLocalFsPathOptions = {
    /** Override platform (e.g. `'win32'` in tests on Linux CI). */
    forPlatform?: NodeJS.Platform;
};

/**
 * On Windows: converts `/mnt/<drive>/...` to `<drive>:/<rest>` and repairs hybrid
 * `X:/mnt/<letter>/...` using the drive letter from `/mnt/<letter>/` (authoritative when it
 * disagrees with the leading `X:`).
 * On other platforms: returns `p` unchanged.
 */
export function toWindowsLocalFsPath(
    p: string,
    opts?: ToWindowsLocalFsPathOptions,
): string {
    if (!p) {
        return p;
    }
    const platform = opts?.forPlatform ?? process.platform;
    if (platform !== 'win32') {
        return p;
    }

    const norm = p.replace(/\\/g, '/');

    const hybrid = norm.match(/^([A-Za-z]):\/?mnt\/([A-Za-z])(?:\/(.*))?$/);
    if (hybrid) {
        const drive = hybrid[2].toUpperCase();
        const rest = hybrid[3] ?? '';
        return rest.length > 0 ? `${drive}:/${rest}` : `${drive}:/`;
    }

    const wsl = norm.match(/^\/mnt\/([A-Za-z])(?:\/(.*))?$/);
    if (wsl) {
        const drive = wsl[1].toUpperCase();
        const rest = wsl[2] ?? '';
        return rest.length > 0 ? `${drive}:/${rest}` : `${drive}:/`;
    }

    return p;
}

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

/**
 * If `p` is a Windows drive-letter absolute path (`D:\\...` or `D:/...`),
 * returns the typical WSL mount (`/mnt/d/...`). Otherwise returns `p` unchanged.
 */
export function windowsDriveToWslMountPath(p: string): string {
    if (!p) {
        return p;
    }
    const norm = p.replace(/\\/g, '/');
    const m = norm.match(/^([A-Za-z]):(?:\/(.*))?$/);
    if (!m) {
        return p;
    }
    const drive = m[1].toLowerCase();
    const rest = m[2] ?? '';
    return rest.length > 0 ? `/mnt/${drive}/${rest}` : `/mnt/${drive}/`;
}

/**
 * Paths to try for `fs.existsSync` when the DB may store WSL (`/mnt/...`) or Windows
 * (`D:/...`) shapes and the gallery Node process may run on Windows or under WSL.
 */
export function crossOsFilePathCandidates(
    p: string,
    opts?: ToWindowsLocalFsPathOptions,
): string[] {
    if (!p) {
        return [];
    }
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (x: string) => {
        if (!x || seen.has(x)) {
            return;
        }
        seen.add(x);
        out.push(x);
    };

    add(p);
    add(toWindowsLocalFsPath(p, opts));
    const wsl = windowsDriveToWslMountPath(p);
    add(wsl);

    return out;
}

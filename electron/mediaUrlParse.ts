/**
 * Map a media:// request URL to a filesystem path segment (before resolve/normalize).
 * Chromium parses `media://D:/path` as host "D" + pathname "/path"; recover the drive letter on Windows.
 * Correct `media:///D:/path` yields pathname "/D:/path".
 *
 * Also handles `media://mnt/d/...` (only two slashes after `media:`): the URL parser treats `mnt`
 * as the host and drops the `/mnt` prefix from the pathname, which would otherwise be joined
 * under thumbnail_base_dir as `d/...`.
 */
export function parseMediaUrlToFilePath(requestUrl: string): string {
    const u = new URL(requestUrl);

    let filePath = u.searchParams.get('path');
    if (!filePath) {
        let pathname = u.pathname;
        try {
            pathname = decodeURIComponent(pathname);
        } catch {
            throw new Error('invalid encoding');
        }

        // Reconstruct WSL path when "mnt" was parsed as the host (media://mnt/d/...).
        if (u.hostname.toLowerCase() === 'mnt' && /^\/[a-zA-Z]\//.test(pathname)) {
            filePath = '/mnt' + pathname;
        } else if (process.platform === 'win32' && /^[a-zA-Z]$/.test(u.hostname) && pathname.length > 1) {
            return `${u.hostname.toUpperCase()}:${pathname}`;
        } else {
            filePath = pathname;
        }
    }

    if (process.platform === 'win32' && filePath.match(/^\/?mnt\/[a-zA-Z]\//)) {
        filePath = filePath.replace(/^\/?mnt\/([a-zA-Z])\//, (_, drive: string) => `${drive.toUpperCase()}:/`);
    }
    if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(filePath)) {
        filePath = filePath.slice(1);
    }
    return filePath;
}

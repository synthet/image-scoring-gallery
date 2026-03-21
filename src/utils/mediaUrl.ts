/**
 * Build a stable media:// URL for the Electron custom protocol.
 * Uses forward slashes so Chromium does not mangle Windows paths in the URL string.
 */
export function toMediaUrl(fsPath: string): string {
    if (!fsPath) return '';
    let p = fsPath.replace(/\\/g, '/');
    // WSL → Windows drive (matches main process handler)
    if (/^\/?mnt\/[a-zA-Z]\//.test(p)) {
        p = p.replace(/^\/?mnt\/([a-zA-Z])\//, (_, d: string) => `${d.toUpperCase()}:/`);
    }
    // Add a local/ host so Chromium does not treat "D:" as host and strip the colon (would become media://d/...).
    if (/^[a-zA-Z]:\//.test(p)) {
        return `media://local/${p}`;
    }
    return `media://local${p.startsWith('/') ? p : `/${p}`}`;
}

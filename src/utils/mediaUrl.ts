/**
 * Returns the URL to use for displaying a media file (thumbnail or full image).
 *
 * - Electron mode → `media:///...` for absolute paths (three slashes after `media:` so Chromium
 *   keeps Windows drive letters in the pathname; see CHANGELOG). Handler in `electron/main.ts`.
 * - Browser mode  → `/media/<encoded-path>` (served by the Express server)
 */
export function toMediaUrl(filePath: string | null | undefined): string {
    if (!filePath) return '';
    if (typeof window !== 'undefined' && window.electron) {
        const normalized = filePath.replace(/\\/g, '/');
        // Windows drive: D:/...  →  media:///D:/...
        if (/^[a-zA-Z]:\//.test(normalized)) {
            return `media:///${normalized}`;
        }
        // WSL-style: /mnt/d/... or mnt/d/...
        if (/^\/?mnt\/[a-zA-Z]\//i.test(normalized)) {
            const rest = normalized.replace(/^\/+/, '');
            return `media:///${rest}`;
        }
        // If it's a repo-relative path (e.g. ../../image-scoring-backend) or Docker root (/app/...),
        // pass it as a query parameter so Chromium's URL parser doesn't collapse `../` sequences 
        // into `media:///image-scoring-backend/...`.
        return `media:///?path=${encodeURIComponent(normalized)}`;
    }
    return `/media/${encodeURIComponent(filePath)}`;
}

/** Alias for compatibility. */
export const getMediaUrl = toMediaUrl;

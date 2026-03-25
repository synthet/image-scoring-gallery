/**
 * Returns the URL to use for displaying a media file (thumbnail or full image).
 *
 * - Electron mode → `media://<absolute-path>` (handled by Electron's custom protocol)
 * - Browser mode  → `/media/<encoded-path>` (served by the Express server)
 */
export function toMediaUrl(filePath: string | null | undefined): string {
    if (!filePath) return '';
    if (typeof window !== 'undefined' && window.electron) {
        return `media://${filePath}`;
    }
    return `/media/${encodeURIComponent(filePath)}`;
}

/** Alias for compatibility. */
export const getMediaUrl = toMediaUrl;

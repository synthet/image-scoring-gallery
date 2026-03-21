/** Extensions the browser can render in <img> without conversion. */
export function isWebSafe(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
}

/** Camera RAW / proprietary formats that need embedded JPEG extraction for thumbnails. */
export function isRaw(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['nef', 'nrw', 'cr2', 'cr3', 'arw', 'orf', 'rw2', 'dng'].includes(ext);
}

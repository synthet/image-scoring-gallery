/** Limit blob URLs kept for grid RAW previews (Virtuoso recycles cells). */
const MAX_ENTRIES = 160;
const cache = new Map<string, string>();
const order: string[] = [];

function normalizePathForFolderPrefix(p: string): string {
    return p.trim().replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase();
}

/** Revoke and drop RAW preview blob URLs for files under `folderPath` (inclusive of exact file paths in that tree). */
export function invalidateRawPreviewCacheForFolder(folderPath: string): void {
    const root = normalizePathForFolderPrefix(folderPath);
    if (!root) return;
    const toRemove: string[] = [];
    for (const filePath of cache.keys()) {
        const n = normalizePathForFolderPrefix(filePath);
        if (n === root || n.startsWith(`${root}/`)) {
            toRemove.push(filePath);
        }
    }
    for (const fp of toRemove) {
        const u = cache.get(fp);
        if (u) URL.revokeObjectURL(u);
        cache.delete(fp);
        const idx = order.indexOf(fp);
        if (idx >= 0) order.splice(idx, 1);
    }
}

export function getCachedRawPreviewUrl(filePath: string): string | undefined {
    return cache.get(filePath);
}

export function setCachedRawPreviewUrl(filePath: string, objectUrl: string): void {
    if (cache.has(filePath)) {
        const old = cache.get(filePath)!;
        if (old !== objectUrl) URL.revokeObjectURL(old);
        cache.set(filePath, objectUrl);
        return;
    }
    while (order.length >= MAX_ENTRIES) {
        const evict = order.shift();
        if (evict) {
            const u = cache.get(evict);
            if (u) URL.revokeObjectURL(u);
            cache.delete(evict);
        }
    }
    order.push(filePath);
    cache.set(filePath, objectUrl);
}

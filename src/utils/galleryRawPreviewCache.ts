/** Limit blob URLs kept for grid RAW previews (Virtuoso recycles cells). */
const MAX_ENTRIES = 160;
const cache = new Map<string, string>();
const order: string[] = [];

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

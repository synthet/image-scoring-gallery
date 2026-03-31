/**
 * In-memory cache for folder-mode `readFsDir` IPC results.
 * Invalidation clears the selected folder and all cached descendant directories.
 */

export interface FsReadDirArgs {
    dirPath: string;
    offset?: number;
    limit?: number;
    kinds?: 'all' | 'dirsOnly';
}

export interface FsReadDirResult {
    dirPath: string;
    directories: { name: string; path: string }[];
    images: { name: string; path: string }[];
    totalImageCount: number;
    rootPath: string;
}

const cache = new Map<string, FsReadDirResult>();

/** Trim trailing separators and use `/` for stable keys and prefix checks. */
export function normalizeFsPathForCache(p: string): string {
    return p.trim().replace(/[/\\]+$/, '').replace(/\\/g, '/');
}

function cacheKeyForArgs(args: FsReadDirArgs): string {
    const norm = normalizeFsPathForCache(args.dirPath);
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 80;
    const kinds = args.kinds ?? 'all';
    return `${norm}\0${offset}\0${limit}\0${kinds}`;
}

function dirPathFromCacheKey(key: string): string {
    return key.split('\0')[0] ?? '';
}

/** True if `dirNorm` is `rootNorm` or a subdirectory (case-insensitive, `/` separated). */
export function isDirPathUnderCacheRoot(dirNorm: string, rootNorm: string): boolean {
    const d = dirNorm.toLowerCase();
    const r = rootNorm.toLowerCase();
    if (!r) return false;
    return d === r || d.startsWith(`${r}/`);
}

export function invalidateFsReadDirCacheForFolder(folderPath: string): void {
    const root = normalizeFsPathForCache(folderPath);
    if (!root) return;
    for (const key of [...cache.keys()]) {
        const dirPart = normalizeFsPathForCache(dirPathFromCacheKey(key));
        if (isDirPathUnderCacheRoot(dirPart, root)) {
            cache.delete(key);
        }
    }
}

/** Parent directory in normalized `/` form, or null (e.g. drive root). */
export function parentDirNormalized(p: string): string | null {
    const t = normalizeFsPathForCache(p);
    const i = t.lastIndexOf('/');
    if (i <= 0) return null;
    const par = t.slice(0, i);
    if (/^[a-zA-Z]:$/.test(par)) return null;
    return par;
}

function cloneFsReadDirResult(res: FsReadDirResult): FsReadDirResult {
    return {
        ...res,
        directories: res.directories.map((d) => ({ ...d })),
        images: res.images.map((im) => ({ ...im })),
    };
}

export async function readFsDirCached(
    readFn: (args: FsReadDirArgs) => Promise<FsReadDirResult>,
    args: FsReadDirArgs,
): Promise<FsReadDirResult> {
    const key = cacheKeyForArgs(args);
    const hit = cache.get(key);
    if (hit) return cloneFsReadDirResult(hit);
    const res = await readFn(args);
    cache.set(key, cloneFsReadDirResult(res));
    return cloneFsReadDirResult(res);
}

/** Test helper: clear entire cache. */
export function __clearFsReadDirCacheForTests(): void {
    cache.clear();
}

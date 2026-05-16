import path from 'path';

/**
 * Fixes malformed thumbnail paths sometimes stored in the DB (e.g. SPA static mount
 * leaking as .../thumbnails/app/thumbnails/... instead of .../thumbnails/...).
 */
export function collapseMalformedThumbnailSegments(input: string): string {
    let s = input;
    let prev = '';
    while (s !== prev) {
        prev = s;
        s = s
            .replace(/thumbnails\/app\/thumbnails/gi, 'thumbnails')
            .replace(/thumbnails\\app\\thumbnails/gi, 'thumbnails');
    }
    return s;
}

/**
 * Strip paths stored relative to the gallery repo (../image-scoring-backend/thumbnails/...)
 * before joining against thumbnail_base_dir / sibling thumbnails folder.
 */
export function stripThumbnailRepoRelativePrefix(restForwardSlashes: string): string {
    return restForwardSlashes.replace(
        /^(?:\.\.\/)+(?:image-scoring-backend|image-scoring)\/thumbnails\//i,
        '',
    );
}

/**
 * Strip Docker / static UI roots persisted in DB (see Python remap_container_thumbnail_path_to_host).
 * `\app\thumbnails\...` is normalized to `/app/thumbnails/...` before this runs.
 */
export function stripDockerAppThumbnailPrefix(restForwardSlashes: string): string {
    return restForwardSlashes.replace(/^(?:static\/)?app\/thumbnails\//i, '');
}

/**
 * Returns the relative path under a thumbnails root (e.g. `91/ab12…jpg`) for any absolute or
 * repo-style path that still contains a `thumbnails/` segment (host `/mnt/…`, Windows, Docker `/app/…`).
 */
export function extractThumbnailTail(input: string): string | null {
    const flat = collapseMalformedThumbnailSegments(input).replace(/\\/g, '/');
    const lower = flat.toLowerCase();
    const marker = '/thumbnails/';
    const idx = lower.lastIndexOf(marker);
    if (idx < 0) return null;
    return flat.slice(idx + marker.length);
}

/**
 * Resolve a DB thumbnail string to an absolute filesystem path.
 * Relative / repo-relative values are joined to `thumbnailBaseDir` or, by default,
 * `../image-scoring-backend/thumbnails` next to the gallery repo (no exists check — missing
 * sibling would otherwise leak `../..` paths into `media://`, which Chromium mis-parses).
 */
export function absolutizeThumbnailPath(
    p: string,
    projectRoot: string,
    thumbnailBaseDir?: string,
): string {
    const cleaned = collapseMalformedThumbnailSegments(p);
    const flat = cleaned.replace(/\\/g, '/');
    // Real host absolute paths — but not Docker / static UI roots (handled below).
    const restProbe = flat.replace(/^\/+/, '');
    const isDockerAppThumb = /^(?:static\/)?app\/thumbnails\//i.test(restProbe);
    if (
        !isDockerAppThumb &&
        (/^[a-zA-Z]:\//i.test(flat) || /^\/mnt\//i.test(flat) || flat.startsWith('//'))
    ) {
        return path.normalize(cleaned);
    }

    // Anchor a *relative* thumbnail_base_dir to the gallery app root (config.example.json
    // uses ../image-scoring-backend/thumbnails). Leaving it relative made path.join() keep
    // .. segments → broken media:// URLs. Absolute bases (D:\..., /var/...) stay as-is.
    let base: string;
    if (thumbnailBaseDir?.trim()) {
        const raw = thumbnailBaseDir.trim();
        base = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectRoot, raw);
    } else {
        base = path.resolve(projectRoot, '../image-scoring-backend/thumbnails');
    }

    let rest = stripThumbnailRepoRelativePrefix(flat.replace(/^\/+/, ''));
    rest = stripDockerAppThumbnailPrefix(rest);
    if (/^thumbnails\//i.test(rest)) {
        rest = rest.replace(/^thumbnails\//i, '');
    }
    return path.normalize(path.join(base, rest));
}

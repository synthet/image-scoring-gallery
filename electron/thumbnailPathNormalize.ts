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

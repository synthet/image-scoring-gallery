/**
 * Path remaps for thumbnail_path values from the DB (renamed folders, Docker vs host paths).
 * Shared by electron/db.ts and the browser-mode /media resolver.
 */

export type PathsConfigSlice = {
    thumbnail_path_remap?: Array<{ from: string; to: string }>;
    remap_legacy_image_scoring_thumbnails?: boolean;
    thumbnail_base_dir?: string;
};

/** After repo renames image-scoring / image-scoring-backend → image-scoring-pipeline; optional user remaps from config */
export function applyThumbnailPathRemaps(p: string, pathsCfg: PathsConfigSlice): string {
    let out = p;
    for (const pair of pathsCfg.thumbnail_path_remap || []) {
        const from = pair?.from;
        const to = pair?.to;
        if (from && to && out.includes(from)) {
            out = out.split(from).join(to);
        }
    }
    if (pathsCfg.remap_legacy_image_scoring_thumbnails !== false) {
        out = out.replace(/([/\\])image-scoring(?:-backend)?([/\\]thumbnails[/\\])/gi, '$1image-scoring-pipeline$2');
    }
    return out;
}

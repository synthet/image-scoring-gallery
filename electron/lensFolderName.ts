/**
 * Lens segment names for File → Sync under `destinationRoot / camera / lens / year / date`.
 * Focal-length tokens align with
 * `image-scoring-backend/scripts/maintenance/move_misplaced_by_lens.py`.
 *
 * If Sync previously created duplicate folders (full marketing names vs `180-600mm`):
 * under each camera folder, compare the wrong directory with the canonical sibling;
 * delete copies that already exist at the same relative path under the canonical lens,
 * otherwise move files (and sidecars) and fix DB paths. Backend helper (dry-run first):
 * `python scripts/maintenance/move_misplaced_by_lens.py --dry-run --source "D:\\Photos\\Z8\\..."`.
 */

// Match focal length patterns: 105mm, 180-600mm, 24-70mm, 10.5mm
const FOCAL_MM_PATTERN = /(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?mm)/i;

const INVALID_LENS_TOKENS = new Set(['0mm']);

/** Placeholder when lens cannot be derived; sync/backup must not create this folder. */
export const UNKNOWN_LENS_FOLDER = '_unknown_lens';

/** Sanitize lens model for use as folder name when no focal `…mm` token is found. */
export function sanitizeLensName(raw: string | undefined | null): string {
    if (!raw?.trim()) return UNKNOWN_LENS_FOLDER;
    return raw.trim().replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, ' ').substring(0, 80);
}

/**
 * Prefer short focal folder names from EXIF LensModel/Lens (e.g. `180-600mm`),
 * matching an existing `D:\Photos\Z8\180-600mm`-style tree.
 */
export function normalizeLensFolderName(raw: string | undefined | null): string {
    if (!raw?.trim()) return UNKNOWN_LENS_FOLDER;
    const trimmed = raw.trim();
    const m = trimmed.match(FOCAL_MM_PATTERN);
    if (m) {
        const token = m[1].toLowerCase();
        if (!INVALID_LENS_TOKENS.has(token)) {
            return token;
        }
    }
    return sanitizeLensName(raw);
}

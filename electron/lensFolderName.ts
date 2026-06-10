/**
 * Lens segment names for File → Sync under `destinationRoot / camera / lens / year / date`.
 *
 * **Keep in sync with** `image-scoring-backend/modules/lens_folder_name.py`
 * (same rules; mirror test cases in `lensFolderName.test.ts` / `test_lens_folder_name.py`).
 *
 * If Sync previously created duplicate folders (full marketing names vs `180-600mm`,
 * or Nikon numeric quads vs `35mm`):
 * under each camera folder, compare the wrong directory with the canonical sibling;
 * delete copies that already exist at the same relative path under the canonical lens,
 * otherwise move files (and sidecars) and fix DB paths. Backend helpers (dry-run first):
 * - `python scripts/maintenance/move_misplaced_by_lens.py --dry-run --source "D:\\Photos\\Z8\\..."`
 * - `python scripts/maintenance/merge_numeric_lens_folders.py --root "H:\\Photos" --dry-run`
 */

// Match focal length patterns: 105mm, 180-600mm, 24-70mm, 10.5mm
const FOCAL_MM_PATTERN = /(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?mm)/i;

/** Nikon EXIF quad: min focal, max focal, max aperture @ min, max aperture @ max (no "mm"). */
const NIKON_LENS_QUAD_PATTERN =
    /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/;

const INVALID_LENS_TOKENS = new Set(['0mm']);

/** Placeholder when lens cannot be derived; sync/backup must not create this folder. */
export const UNKNOWN_LENS_FOLDER = '_unknown_lens';

/** Strip unnecessary .0 decimals from focal numbers (parity with Python `_fmt_focal`). */
export function formatFocalToken(value: number): string {
    return Number.isInteger(value) ? String(value) : String(value);
}

/** Parse Nikon numeric lens specification into canonical `…mm` folder token. */
export function parseNikonLensQuad(trimmed: string): string | null {
    const m = trimmed.match(NIKON_LENS_QUAD_PATTERN);
    if (!m) return null;

    const minF = parseFloat(m[1]);
    const maxF = parseFloat(m[2]);
    if (!Number.isFinite(minF) || !Number.isFinite(maxF) || minF <= 0 || maxF <= 0) {
        return null;
    }

    if (minF === maxF) {
        const token = `${formatFocalToken(minF)}mm`;
        return INVALID_LENS_TOKENS.has(token) ? null : token;
    }

    const token = `${formatFocalToken(minF)}-${formatFocalToken(maxF)}mm`;
    return INVALID_LENS_TOKENS.has(token) ? null : token;
}

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

    const quad = parseNikonLensQuad(trimmed);
    if (quad) {
        return quad;
    }

    return sanitizeLensName(raw);
}

/**
 * Canonical camera model → backup/sync folder name.
 *
 * Keep in sync with `image-scoring-backend/modules/camera_folder_name.py`
 * (same rules; mirror test cases in `cameraFolderName.test.ts` / `test_camera_folder_name.py`).
 */

const MODEL_OVERRIDES: Record<string, string> = {
    'nikon z 6': 'Z6ii',
    'nikon z6': 'Z6ii',
};

function sanitizeFs(s: string): string {
    const stripped = String(s).trim().replace(/[<>:"/\\|?*]/g, '');
    const collapsed = stripped.replace(/\s+/g, '');
    return collapsed || 'unknown';
}

/**
 * Derive a single path segment from camera EXIF Model (parity with Python `camera_folder_from_exif_model`).
 * Returns `unknown` when the model is missing or unparseable.
 */
export function cameraFolderFromExifModel(model: string | null | undefined): string {
    if (!model || model.toLowerCase() === 'unknown') {
        return 'unknown';
    }
    const m = model.trim();

    const override = MODEL_OVERRIDES[m.toLowerCase()];
    if (override) {
        return override;
    }

    // Nikon Z series — "Nikon Z 6 II", "NIKON Z 6_2", "Z8"
    const nikonZ = m.match(/Z\s*(\d+)(\s*(?:_2|II|ii))?/i);
    if (nikonZ) {
        const gen2 = nikonZ[2] || '';
        const suffix = /_2|II|ii/i.test(gen2) ? 'ii' : '';
        return `Z${nikonZ[1]}${suffix}`;
    }

    // Nikon D series — "NIKON D300", "D90", optional S/X/H suffix
    const nikonD = m.match(/(?:NIKON\s*)?D(\d+)(\s*(?:S|X|H))?/i);
    if (nikonD) {
        const sfx = nikonD[2] ? nikonD[2].trim().toUpperCase() : '';
        return `D${nikonD[1]}${sfx}`;
    }

    // Canon EOS R series
    const canonR = m.match(/EOS\s*R\s*(\d+)/i);
    if (canonR) {
        return `R${canonR[1]}`;
    }

    // Fallback: strip brand, last 1–2 tokens (matches Python)
    const mClean = m.replace(/^(Nikon|Canon|Camera|Sony)\s+/i, '');
    const tokens = mClean.match(/[A-Za-z0-9]+/g) || [];
    if (tokens.length >= 2) {
        return tokens.slice(-2).join('');
    }
    if (tokens.length === 1) {
        return tokens[0];
    }
    return sanitizeFs(m);
}

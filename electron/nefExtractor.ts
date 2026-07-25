import { exiftool } from "exiftool-vendored";
import fs from "fs/promises";
import path from "path";
import os from "os";

/** Common exiftool-vendored / ExifTool Orientation string → EXIF numeric 1..8 */
const ORIENTATION_STRING_TO_NUMERIC: Record<string, number> = {
    "Horizontal (normal)": 1,
    "Mirror horizontal": 2,
    "Rotate 180": 3,
    "Mirror vertical": 4,
    "Mirror horizontal and rotate 270 CW": 5,
    "Rotate 90 CW": 6,
    "Mirror horizontal and rotate 90 CW": 7,
    "Rotate 270 CW": 8,
};

/**
 * Coerce EXIF Orientation from NEF tags to numeric 1..8.
 * exiftool-vendored may return a number or a descriptive string.
 */
export function normalizeOrientationToNumeric(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8) {
        return value;
    }
    const s = String(value).trim();
    if (!s) return null;
    const asInt = Number.parseInt(s, 10);
    if (Number.isInteger(asInt) && asInt >= 1 && asInt <= 8 && String(asInt) === s) {
        return asInt;
    }
    return ORIENTATION_STRING_TO_NUMERIC[s] ?? null;
}

/**
 * Server-side NEF preview extractor using exiftool-vendored
 * Handles all Nikon formats including Z8 HE/HE*, Z9, Z6II, D90
 */
export class NefExtractor {
    private static instance: NefExtractor;

    private constructor() { }

    public static getInstance(): NefExtractor {
        if (!NefExtractor.instance) {
            NefExtractor.instance = new NefExtractor();
        }
        return NefExtractor.instance;
    }

    /**
     * Extract the largest/best JPEG preview using exiftool.
     * This is the most reliable method for all Nikon formats.
     * 
     * @param nefPath - Absolute path to the NEF file
     * @returns Buffer containing JPEG data, or null if extraction failed
     */
    public async extractPreview(nefPath: string): Promise<Buffer | null> {
        const tempDir = os.tmpdir();
        const tempJpeg = path.join(tempDir, `preview_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);

        try {
            console.log(`[NefExtractor] Attempting exiftool extraction for: ${nefPath}`);

            // 1. Read the orientation from the original NEF first (coerce to numeric 1..8)
            const tags = await exiftool.read(nefPath);
            const orientation = normalizeOrientationToNumeric(tags.Orientation);

            // 2. Extract best JPEG (JpgFromRaw or PreviewImage)
            await exiftool.extractJpgFromRaw(nefPath, tempJpeg);

            // 3. Since exiftool just dumps the binary chunk, it might lack EXIF orientation or have it stripped
            // Stamp numeric Orientation onto the extract so bake / browsers can apply it.
            if (orientation != null && orientation >= 2) {
                console.log(`[NefExtractor] Detected orientation: ${orientation}, applying to extracted JPEG`);
                await exiftool.write(tempJpeg, { Orientation: orientation }, ['-overwrite_original']);
            }

            const buffer = await fs.readFile(tempJpeg);
            console.log(`[NefExtractor] ✓ Tier 1: exiftool extracted preview (${(buffer.length / 1024).toFixed(1)} KB)`);

            // Cleanup temp file
            await fs.unlink(tempJpeg).catch(() => { }); // Ignore cleanup errors

            return buffer;
        } catch (e: unknown) {
            // Log the actual error message for debugging
            const err = e instanceof Error ? e : new Error(String(e));
            const errorMsg = (e as NodeJS.ErrnoException)?.code === 'ENOENT' ? `File not found - ${nefPath}` : err.message;
            console.warn(`[NefExtractor] ✗ Tier 1 failed: ${errorMsg}`);

            // Cleanup temp file if it exists
            await fs.unlink(tempJpeg).catch(() => { });

            return null;
        }
    }

    /**
     * Cleanup resources when shutting down
     */
    public async cleanup(): Promise<void> {
        try {
            await exiftool.end();
            console.log('[NefExtractor] Cleaned up exiftool resources');
        } catch (e) {
            console.error('[NefExtractor] Cleanup error:', e);
        }
    }
}

export const nefExtractor = NefExtractor.getInstance();

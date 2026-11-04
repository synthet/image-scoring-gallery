import fs from 'fs';
import path from 'path';
import { copyFileAtomic } from './atomicCopy';
import type { ExportOriginalsResult } from './types';

export interface ExportOriginalsOptions {
    /** The renderer supplies the paths, so each one must belong to the gallery. */
    isGalleryFile: (file: string) => Promise<boolean>;
    signal?: AbortSignal;
    onProgress?: (current: number, total: number) => void;
}

/** A name in `destDir` that nothing uses yet: `a.nef`, then `a (2).nef`, `a (3).nef`. */
async function freeDestination(destDir: string, file: string): Promise<string> {
    const { name, ext } = path.parse(file);
    for (let n = 1; ; n++) {
        const candidate = path.join(destDir, n === 1 ? `${name}${ext}` : `${name} (${n})${ext}`);
        if (!(await fs.promises.stat(candidate).catch(() => null))) return candidate;
    }
}

/**
 * Copies the original files into `destDir` (#239). Nothing in the library changes: sources stay in place,
 * no database row is touched, and an existing file is never overwritten. A cancel stops between files.
 */
export async function exportOriginals(
    files: readonly string[],
    destDir: string,
    { isGalleryFile, signal, onProgress }: ExportOriginalsOptions,
): Promise<ExportOriginalsResult> {
    const result: ExportOriginalsResult = { total: files.length, copied: 0, failed: [], cancelled: false };
    for (const [index, file] of files.entries()) {
        if (signal?.aborted) {
            result.cancelled = true;
            break;
        }
        try {
            if (!(await isGalleryFile(file))) throw new Error('Not a gallery file');
            await copyFileAtomic(file, await freeDestination(destDir, file));
            result.copied++;
        } catch (e) {
            result.failed.push({ file, error: e instanceof Error ? e.message : String(e) });
        }
        onProgress?.(index + 1, files.length);
    }
    return result;
}

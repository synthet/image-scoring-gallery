import fs from 'fs';

/**
 * Copies `source` to `dest` through `<dest>.part` and renames it into place once complete (#238).
 * A crash or failure mid-copy can't leave a truncated file at `dest`, which a later run would skip as
 * already on disk. A failed copy removes its `.part`; a leftover from a crash is overwritten next time.
 */
export async function copyFileAtomic(source: string, dest: string): Promise<void> {
    const part = `${dest}.part`;
    try {
        await fs.promises.copyFile(source, part);
        await fs.promises.rename(part, dest);
    } catch (e) {
        await fs.promises.unlink(part).catch(() => undefined);
        throw e;
    }
}

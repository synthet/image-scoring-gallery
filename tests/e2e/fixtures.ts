import fs from 'node:fs';
import path from 'node:path';
import { ExifTool } from 'exiftool-vendored';

/**
 * Generated fixtures: nothing binary is committed. A 64x48 gradient JPEG (927 bytes) is embedded as base64;
 * each copy is stamped with its own EXIF capture time by exiftool, so date-ordered views have real data.
 */
const SEED_JPEG_BASE64 = [
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYn',
    'KSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo',
    'KCgoKCgoKCj/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUF',
    'BAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVW',
    'V1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi',
    '4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC',
    'AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVm',
    'Z2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq',
    '8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD57htOnFXYrT2rSitParsVp04r7WeJOLC4szYrT2q5Fae1acVp7VditPauOpiT6XC4szIr',
    'T2q7DadOK0orT2q7Fae1cU8SfSYXFmbFae1XIrTpxWnDadOKuxWntXHPEn0uFxZwsNp04q5Fae1acVp7VdhtOnFb1MSfzXhcWZkN',
    'p04q7Fae1aUVp7VditPauKeJPpcLizNitParkNp04rTitParsVp7Vx1MSfSYXFmZFae1XYbTpxWnFadOKuRWntXHUxJ9LhcWcLFa',
    'dOKuxWntWnFae1XIbTpxW88SfzXhcX5mbFadOKuxWntWlFae1XYrT2riqYk+kwuL8zMitParsVp7VpxWntVyK09q454k+lwuL8zN',
    'itParsNp04rShtOnFXYrT2rjniT6TC4vzP/Z',
].join('');

export interface FixtureImage {
    file: string;
    path: string;
    captureTime: string;
}

/** Writes `count` JPEGs named DSC_0001.JPG... into `dir`, one minute apart from `start` (EXIF DateTimeOriginal). */
export async function generateJpegs(dir: string, count: number, start = new Date(Date.UTC(2026, 0, 19, 16, 0, 0))): Promise<FixtureImage[]> {
    fs.mkdirSync(dir, { recursive: true });
    const seed = Buffer.from(SEED_JPEG_BASE64, 'base64');
    const exiftool = new ExifTool({ maxProcs: 1, taskTimeoutMillis: 20_000 });
    const out: FixtureImage[] = [];
    try {
        for (let i = 0; i < count; i++) {
            const file = `DSC_${String(i + 1).padStart(4, '0')}.JPG`;
            const target = path.join(dir, file);
            fs.writeFileSync(target, seed);
            const t = new Date(start.getTime() + i * 60_000);
            const exifTime = t.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, ':');
            await exiftool.write(target, { DateTimeOriginal: exifTime }, { writeArgs: ['-overwrite_original'] });
            out.push({ file, path: target, captureTime: exifTime });
        }
    } finally {
        await exiftool.end();
    }
    return out;
}

/**
 * Writes `count` copies of the seed JPEG named DSC_0001.JPG... into `dir`, without EXIF stamping.
 * For large-data journeys, where thousands of exiftool writes would dominate the run time.
 */
export function copyJpegs(dir: string, count: number): string[] {
    fs.mkdirSync(dir, { recursive: true });
    const seed = Buffer.from(SEED_JPEG_BASE64, 'base64');
    const files: string[] = [];
    for (let i = 0; i < count; i++) {
        const file = `DSC_${String(i + 1).padStart(4, '0')}.JPG`;
        fs.writeFileSync(path.join(dir, file), seed);
        files.push(file);
    }
    return files;
}

/**
 * Writes `count` files named DSC_0001.NEF... into `dir`. Sync picks files by extension and reads the
 * capture date with exiftool, so a stamped JPEG under a .NEF name exercises it without a real RAW file.
 * Each copy gets its own trailing byte, so a mixed-up copy would show in a content check.
 */
export async function generateNefNamedPhotos(dir: string, count: number): Promise<string[]> {
    const seedDir = fs.mkdtempSync(path.join(path.dirname(dir), 'seed-'));
    const [seed] = await generateJpegs(seedDir, 1);
    // Sync skips photos without a camera and lens: it can't place them in its folder layout.
    const exiftool = new ExifTool({ maxProcs: 1, taskTimeoutMillis: 20_000 });
    try {
        await exiftool.write(seed.path, { Model: 'NIKON Z 8', LensModel: 'NIKKOR Z 180-600mm' }, { writeArgs: ['-overwrite_original'] });
    } finally {
        await exiftool.end();
    }
    const bytes = fs.readFileSync(seed.path);
    fs.mkdirSync(dir, { recursive: true });
    const files: string[] = [];
    for (let i = 0; i < count; i++) {
        const file = `DSC_${String(i + 1).padStart(4, '0')}.NEF`;
        fs.writeFileSync(path.join(dir, file), Buffer.concat([bytes, Buffer.from([i % 256])]));
        files.push(file);
    }
    fs.rmSync(seedDir, { recursive: true, force: true });
    return files;
}

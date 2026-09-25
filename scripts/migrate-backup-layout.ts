#!/usr/bin/env npx tsx
/**
 * Reorganize a backup destination from legacy layouts (e.g. `2013/IMG.NEF`)
 * into canonical `camera/lens/year/YYYY-MM-DD/filename`.
 *
 * Updates `manifest.json` relPath values when present.
 *
 * Usage:
 *   npx tsx scripts/migrate-backup-layout.ts <targetFolder> [--dry-run] [--limit N] [--from-disk]
 *
 * Resume after interrupt: re-run with `--from-disk` (default when manifest paths are stale).
 * Skips files already at canonical paths; reconciles manifest relPaths at the end.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { ExifTool } from 'exiftool-vendored';
import { cameraFolderFromExifModel } from '../electron/cameraFolderName';
import { normalizeLensFolderName, UNKNOWN_LENS_FOLDER } from '../electron/lensFolderName';
import { backupYearFromDateKey } from '../electron/backupSelection';
import { BACKUP_IMAGE_EXTENSIONS, xmpSidecarPath } from '../electron/backupSpace';
import type { BackupManifest } from '../electron/types';

const UNKNOWN_CAMERA_FOLDER = '_unknown_camera';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function usage(): never {
    console.error('Usage: npx tsx scripts/migrate-backup-layout.ts <targetFolder> [--dry-run] [--limit N]');
    process.exit(1);
}

function normalizeCameraModel(raw: string | undefined | null): string {
    const seg = cameraFolderFromExifModel(raw ?? undefined);
    return seg === 'unknown' ? UNKNOWN_CAMERA_FOLDER : seg;
}

function isUnresolvedLayout(camera: string, lens: string): boolean {
    return camera === UNKNOWN_CAMERA_FOLDER || lens === UNKNOWN_LENS_FOLDER;
}

function normalizeRel(rel: string): string {
    return rel.replace(/\\/g, '/');
}

function isCanonicalRelPath(relPath: string): boolean {
    const parts = normalizeRel(relPath).split('/');
    if (parts.length < 5) return false;
    const year = parts[parts.length - 3];
    const date = parts[parts.length - 2];
    return /^\d{4}$/.test(year) && ISO_DATE.test(date);
}

function dateFromFilename(fileName: string): string | null {
    const match = fileName.match(/(\d{4})(\d{2})(\d{2})/);
    if (!match) return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
}

function dateFromLegacyFolder(relPath: string): string | null {
    const parts = normalizeRel(relPath).split('/');
    if (parts.length < 2) return null;
    const folder = parts[parts.length - 2];
    if (/^\d{4}$/.test(folder)) {
        return dateFromFilename(parts[parts.length - 1]);
    }
    return null;
}

async function readLayoutFromExif(
    exiftool: ExifTool,
    absPath: string,
    fileName: string,
    legacyRelPath: string,
): Promise<{ camera: string; lens: string; dateStr: string } | null> {
    let dateStr: string | null = dateFromLegacyFolder(legacyRelPath) ?? dateFromFilename(fileName);
    let cameraModel: string | null = null;
    let lensModel: string | null = null;

    try {
        const tags = await exiftool.read(absPath);
        const dto = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
        if (dto) {
            const raw = typeof dto === 'string' ? dto : String(dto);
            const match = raw.match(/(\d{4})[:-](\d{2})[:-](\d{2})/);
            if (match) {
                dateStr = `${match[1]}-${match[2]}-${match[3]}`;
            }
        }
        cameraModel = (tags.Model as string) ?? null;
        lensModel = (tags.LensModel as string) ?? (tags.Lens as string) ?? null;
    } catch {
        /* fall back to filename / legacy folder */
    }

    if (!dateStr || !ISO_DATE.test(dateStr)) {
        try {
            const st = await fs.stat(absPath);
            const d = st.mtime;
            dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } catch {
            return null;
        }
    }

    const camera = normalizeCameraModel(cameraModel);
    const lens = normalizeLensFolderName(lensModel);
    if (isUnresolvedLayout(camera, lens)) {
        return null;
    }

    return { camera, lens, dateStr };
}

function canonicalRelPath(
    camera: string,
    lens: string,
    dateStr: string,
    fileName: string,
): string {
    const year = backupYearFromDateKey(dateStr);
    return path.join(camera, lens, year, dateStr, fileName);
}

function isMacOsResourceFork(fileName: string): boolean {
    return fileName.startsWith('._');
}

async function collectImageFiles(rootDir: string, dir: string, acc: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (ent.name === 'Trash') continue;
            await collectImageFiles(rootDir, full, acc);
            continue;
        }
        if (!ent.isFile()) continue;
        if (isMacOsResourceFork(ent.name)) continue;
        const lower = ent.name.toLowerCase();
        if (lower === 'manifest.json' || lower.startsWith('manifest.json.')) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!BACKUP_IMAGE_EXTENSIONS.has(ext)) continue;
        const rel = path.relative(rootDir, full);
        if (rel.startsWith('..')) continue;
        acc.push(rel);
    }
}

/** Match manifest rows to on-disk files by basename + size when relPath is stale. */
async function reconcileManifestRelPaths(
    manifest: BackupManifest,
    rootDir: string,
): Promise<number> {
    const onDisk: string[] = [];
    await collectImageFiles(rootDir, rootDir, onDisk);

    const byKey = new Map<string, string[]>();
    for (const rel of onDisk) {
        const abs = path.join(rootDir, rel);
        let size = 0;
        try {
            size = (await fs.stat(abs)).size;
        } catch {
            continue;
        }
        const key = `${path.basename(rel)}\0${size}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(rel);
    }

    let updated = 0;
    for (const entry of manifest.images) {
        const abs = path.join(rootDir, entry.relPath);
        if (fsSync.existsSync(abs)) {
            if (isCanonicalRelPath(entry.relPath)) continue;
            /* still at legacy path — migration pass will move it */
            continue;
        }
        const key = `${path.basename(entry.relPath)}\0${entry.size || 0}`;
        const candidates = byKey.get(key);
        if (!candidates || candidates.length === 0) continue;
        const canonical = candidates.find((c) => isCanonicalRelPath(c));
        const next = canonical ?? candidates[0];
        if (normalizeRel(entry.relPath).toLowerCase() !== normalizeRel(next).toLowerCase()) {
            entry.relPath = next;
            updated++;
        }
    }
    return updated;
}

async function pruneEmptyDirs(rootDir: string, dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const full = path.join(dir, ent.name);
        await pruneEmptyDirs(rootDir, full);
    }
    const after = await fs.readdir(dir);
    if (after.length === 0 && path.resolve(dir) !== path.resolve(rootDir)) {
        await fs.rmdir(dir);
    }
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    const fromDisk = argv.includes('--from-disk') || !argv.includes('--from-manifest');
    const limitArg = argv.find((a) => a.startsWith('--limit='))
        ?? (argv.includes('--limit') ? `--limit=${argv[argv.indexOf('--limit') + 1]}` : undefined);
    const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : Number.POSITIVE_INFINITY;

    const targetArg = argv.find((a) => !a.startsWith('-') && !/^\d+$/.test(a));
    if (!targetArg) usage();

    const rootDir = path.resolve(targetArg);
    const stat = await fs.stat(rootDir).catch(() => null);
    if (!stat?.isDirectory()) {
        console.error(`Not a directory: ${rootDir}`);
        process.exit(1);
    }

    const manifestPath = path.join(rootDir, 'manifest.json');
    let manifest: BackupManifest | null = null;
    if (fsSync.existsSync(manifestPath)) {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as BackupManifest;
    }

    let relPaths: string[];
    if (fromDisk) {
        const acc: string[] = [];
        await collectImageFiles(rootDir, rootDir, acc);
        acc.sort((a, b) => normalizeRel(a).localeCompare(normalizeRel(b)));
        relPaths = acc.filter((rel) => !isCanonicalRelPath(rel));
    } else {
        relPaths = manifest?.images.map((e) => e.relPath) ?? [];
    }

    const work = relPaths.slice(0, Number.isFinite(limit) ? limit : relPaths.length);
    console.log(`Target:  ${rootDir}`);
    console.log(`Source:  ${fromDisk ? 'disk (non-canonical only)' : 'manifest relPaths'}`);
    console.log(`Work:    ${work.length.toLocaleString()} of ${relPaths.length.toLocaleString()} legacy on disk`);
    console.log(`Mode:    ${dryRun ? 'dry-run' : 'move'}`);

    const exiftool = new ExifTool();
    const relPathMap = new Map<string, string>();
    let moved = 0;
    let skippedCanonical = 0;
    let skippedMissing = 0;
    let skippedUnresolved = 0;
    let conflicts = 0;

    try {
        for (let i = 0; i < work.length; i++) {
            const oldRel = work[i];
            if (isCanonicalRelPath(oldRel)) {
                skippedCanonical++;
                continue;
            }

            const absOld = path.join(rootDir, oldRel);
            if (!fsSync.existsSync(absOld)) {
                skippedMissing++;
                continue;
            }

            const fileName = path.basename(oldRel);
            if (isMacOsResourceFork(fileName)) {
                skippedUnresolved++;
                continue;
            }

            const layout = await readLayoutFromExif(exiftool, absOld, fileName, oldRel);
            if (!layout) {
                skippedUnresolved++;
                if (skippedUnresolved <= 10) {
                    console.warn(`[skip] unresolved layout: ${normalizeRel(oldRel)}`);
                }
                continue;
            }

            const newRel = canonicalRelPath(layout.camera, layout.lens, layout.dateStr, fileName);
            if (normalizeRel(oldRel).toLowerCase() === normalizeRel(newRel).toLowerCase()) {
                skippedCanonical++;
                relPathMap.set(oldRel, newRel);
                continue;
            }

            const absNew = path.join(rootDir, newRel);
            if (fsSync.existsSync(absNew)) {
                const [oldSt, newSt] = await Promise.all([fs.stat(absOld), fs.stat(absNew)]);
                if (oldSt.size === newSt.size) {
                    relPathMap.set(oldRel, newRel);
                    skippedCanonical++;
                    continue;
                }
                conflicts++;
                console.warn(`[conflict] ${normalizeRel(oldRel)} -> ${normalizeRel(newRel)} (dest exists, different size)`);
                continue;
            }

            if (!dryRun) {
                await fs.mkdir(path.dirname(absNew), { recursive: true });
                await fs.rename(absOld, absNew);

                const oldXmp = xmpSidecarPath(absOld);
                const newXmp = xmpSidecarPath(absNew);
                if (fsSync.existsSync(oldXmp)) {
                    await fs.mkdir(path.dirname(newXmp), { recursive: true });
                    await fs.rename(oldXmp, newXmp);
                }
            }

            relPathMap.set(oldRel, newRel);
            moved++;

            if (!dryRun && manifest && moved % 250 === 0) {
                for (const entry of manifest.images) {
                    const next = relPathMap.get(entry.relPath);
                    if (next) entry.relPath = next;
                }
                const reconciled = await reconcileManifestRelPaths(manifest, rootDir);
                manifest.updatedAt = new Date().toISOString();
                const tmp = `${manifestPath}.tmp`;
                await fs.writeFile(tmp, `${JSON.stringify(manifest)}\n`, 'utf8');
                await fs.rename(tmp, manifestPath);
                console.log(`  checkpoint moved=${moved} relPath patches=${relPathMap.size} reconciled=${reconciled}`);
            }

            if ((i + 1) % 250 === 0 || i + 1 === work.length) {
                console.log(`  progress ${i + 1}/${work.length} moved=${moved}`);
            }
        }
    } finally {
        await exiftool.end();
    }

    if (!dryRun && manifest) {
        for (const entry of manifest.images) {
            const next = relPathMap.get(entry.relPath);
            if (next) entry.relPath = next;
        }
        const reconciled = await reconcileManifestRelPaths(manifest, rootDir);
        manifest.updatedAt = new Date().toISOString();
        const bak = `${manifestPath}.bak`;
        if (fsSync.existsSync(manifestPath)) {
            await fs.copyFile(manifestPath, bak);
        }
        const tmp = `${manifestPath}.tmp`;
        await fs.writeFile(tmp, `${JSON.stringify(manifest)}\n`, 'utf8');
        await fs.rename(tmp, manifestPath);
        console.log(`Manifest updated (${relPathMap.size.toLocaleString()} moves, ${reconciled.toLocaleString()} reconciled), backup: ${bak}`);
    }

    if (!dryRun) {
        await pruneEmptyDirs(rootDir, rootDir);
    }

    console.log('Done.');
    console.log(`  moved:              ${moved.toLocaleString()}`);
    console.log(`  already canonical:  ${skippedCanonical.toLocaleString()}`);
    console.log(`  missing on disk:    ${skippedMissing.toLocaleString()}`);
    console.log(`  unresolved layout:    ${skippedUnresolved.toLocaleString()}`);
    console.log(`  conflicts:          ${conflicts.toLocaleString()}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

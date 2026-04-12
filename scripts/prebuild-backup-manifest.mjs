#!/usr/bin/env node
/**
 * Pre-create gallery Backup `manifest.json` from files already on disk under a target folder.
 *
 * Layout: each file's path relative to the target root becomes `relPath` (same as Electron backup).
 * `id` is 0, `score` is 0, `hash` is "" — the next real Backup run will refresh rows for paths it copies.
 *
 * Usage:
 *   node scripts/prebuild-backup-manifest.mjs <targetFolder> [--dry-run] [--force]
 *
 * Examples:
 *   node scripts/prebuild-backup-manifest.mjs "H:\Photos"
 *   node scripts/prebuild-backup-manifest.mjs "H:\Photos" --dry-run
 *
 * Options:
 *   --dry-run   Print summary only; do not write manifest.json
 *   --force     Write manifest.json without backing up an existing file to manifest.json.bak
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Same set as `IMAGE_EXTENSIONS` in electron/main.ts (backup). */
const IMAGE_EXTENSIONS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.nef',
    '.arw',
    '.cr2',
    '.dng',
    '.heic',
    '.webp',
    '.tiff',
    '.tif',
    '.raw',
    '.orf',
    '.rw2',
]);

async function collectImageFiles(rootDir, dir, acc) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            await collectImageFiles(rootDir, full, acc);
            continue;
        }
        if (!ent.isFile()) continue;
        const base = ent.name;
        if (base.toLowerCase() === 'manifest.json' || base.toLowerCase().startsWith('manifest.json.')) {
            continue;
        }
        const ext = path.extname(base).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;
        const rel = path.relative(rootDir, full);
        if (rel.startsWith('..')) continue;
        acc.push(full);
    }
}

async function main() {
    const raw = process.argv.slice(2).filter((a) => a !== '--dry-run' && a !== '--force');
    const dryRun = process.argv.includes('--dry-run');
    const force = process.argv.includes('--force');

    const targetArg = raw.find((a) => !a.startsWith('-'));
    if (!targetArg) {
        console.error('Usage: node scripts/prebuild-backup-manifest.mjs <targetFolder> [--dry-run] [--force]');
        process.exit(1);
    }

    const rootDir = path.resolve(targetArg);
    let stat;
    try {
        stat = await fs.stat(rootDir);
    } catch (e) {
        console.error(`Not found or not accessible: ${rootDir}`);
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    }
    if (!stat.isDirectory()) {
        console.error(`Not a directory: ${rootDir}`);
        process.exit(1);
    }

    const files = [];
    await collectImageFiles(rootDir, rootDir, files);
    files.sort((a, b) => path.relative(rootDir, a).localeCompare(path.relative(rootDir, b)));

    const images = [];
    for (const abs of files) {
        const relPath = path.relative(rootDir, abs);
        const st = await fs.stat(abs);
        images.push({
            id: 0,
            relPath,
            score: 0,
            size: st.size,
            hash: '',
        });
    }

    const manifest = {
        updatedAt: new Date().toISOString(),
        images,
    };

    const manifestPath = path.join(rootDir, 'manifest.json');
    const json = `${JSON.stringify(manifest, null, 2)}\n`;

    console.log(`Target:     ${rootDir}`);
    console.log(`Images:     ${images.length}`);
    console.log(`Output:     ${manifestPath}`);

    if (dryRun) {
        console.log('[dry-run] No file written.');
        return;
    }

    if (!force) {
        try {
            await fs.access(manifestPath);
            const bak = `${manifestPath}.bak`;
            await fs.copyFile(manifestPath, bak);
            console.log(`Backed up:  ${bak}`);
        } catch {
            // no existing manifest
        }
    }

    await fs.writeFile(manifestPath, json, 'utf8');
    console.log('Wrote manifest.json');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

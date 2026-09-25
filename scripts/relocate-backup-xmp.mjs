#!/usr/bin/env node
/**
 * Move orphan XMP sidecars next to their matching images; delete unmatched XMP;
 * prune empty directories under a backup destination.
 *
 * Usage:
 *   node scripts/relocate-backup-xmp.mjs <targetFolder> [--dry-run]
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IMAGE_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.nef', '.arw', '.cr2', '.dng', '.heic', '.webp',
    '.tiff', '.tif', '.raw', '.orf', '.rw2',
]);

function xmpSidecarPath(filePath) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    return path.join(dir, `${base}.xmp`);
}

function baseKey(fileName) {
    return path.basename(fileName, path.extname(fileName)).toLowerCase();
}

/** `20130627_0285-2.xmp` may belong to `20130627_0285.NEF`. */
function alternateKeys(base) {
    const keys = [base];
    const m = base.match(/^(.+)-(\d+)$/);
    if (m) keys.push(m[1]);
    return keys;
}

async function collectFiles(rootDir, dir, images, xmps) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (ent.name === 'Trash') continue;
            await collectFiles(rootDir, full, images, xmps);
            continue;
        }
        if (!ent.isFile()) continue;
        const lower = ent.name.toLowerCase();
        if (lower === 'manifest.json' || lower.startsWith('manifest.json.')) continue;
        const rel = path.relative(rootDir, full);
        if (rel.startsWith('..')) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (ext === '.xmp') {
            xmps.push(full);
        } else if (IMAGE_EXTENSIONS.has(ext)) {
            images.push(full);
        }
    }
}

async function pruneEmptyDirs(rootDir, dir) {
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

async function main() {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    const targetArg = argv.find((a) => !a.startsWith('-'));
    if (!targetArg) {
        console.error('Usage: node scripts/relocate-backup-xmp.mjs <targetFolder> [--dry-run]');
        process.exit(1);
    }

    const rootDir = path.resolve(targetArg);
    if (!fsSync.statSync(rootDir).isDirectory()) {
        console.error(`Not a directory: ${rootDir}`);
        process.exit(1);
    }

    const images = [];
    const xmps = [];
    await collectFiles(rootDir, rootDir, images, xmps);

    const imageByKey = new Map();
    for (const abs of images) {
        imageByKey.set(baseKey(path.basename(abs)), abs);
    }

    function findImageForXmp(xmpAbs) {
        const keys = alternateKeys(baseKey(path.basename(xmpAbs)));
        for (const key of keys) {
            const hit = imageByKey.get(key);
            if (hit) return hit;
        }
        return null;
    }

    let moved = 0;
    let already = 0;
    let deleted = 0;
    let skippedConflict = 0;

    console.log(`Target: ${rootDir}`);
    console.log(`Mode:   ${dryRun ? 'dry-run' : 'apply'}`);
    console.log(`Images: ${images.length.toLocaleString()}  XMP: ${xmps.length.toLocaleString()}`);

    for (const xmpAbs of xmps) {
        const imageAbs = findImageForXmp(xmpAbs);
        if (!imageAbs) {
            if (!dryRun) await fs.unlink(xmpAbs);
            deleted++;
            continue;
        }

        const destXmp = xmpSidecarPath(imageAbs);
        const samePath = path.resolve(xmpAbs).toLowerCase() === path.resolve(destXmp).toLowerCase();
        if (samePath) {
            already++;
            continue;
        }

        if (fsSync.existsSync(destXmp)) {
            if (!dryRun) await fs.unlink(xmpAbs);
            deleted++;
            skippedConflict++;
            continue;
        }

        if (!dryRun) {
            await fs.mkdir(path.dirname(destXmp), { recursive: true });
            await fs.rename(xmpAbs, destXmp);
        }
        moved++;
    }

    if (!dryRun) {
        await pruneEmptyDirs(rootDir, rootDir);
    }

    console.log('Done.');
    console.log(`  moved next to image:     ${moved.toLocaleString()}`);
    console.log(`  already adjacent:        ${already.toLocaleString()}`);
    console.log(`  deleted (no match/dup):  ${deleted.toLocaleString()} (${skippedConflict.toLocaleString()} dup at dest)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

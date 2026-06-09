#!/usr/bin/env node
/**
 * Read-only audit: compare relPath sets between two backup manifest.json files.
 *
 * Usage:
 *   node scripts/audit-backup-manifest-diff.mjs <oldManifest> <newManifest>
 *
 * Example:
 *   node scripts/audit-backup-manifest-diff.mjs "H:\Photos\manifest.json.bak" "H:\Photos\manifest.json"
 */

import fs from 'fs/promises';
import path from 'path';

async function loadManifest(filePath) {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const images = Array.isArray(data.images) ? data.images : [];
    return images.map((entry) => String(entry.relPath ?? '')).filter(Boolean);
}

async function main() {
    const [oldPath, newPath] = process.argv.slice(2);
    if (!oldPath || !newPath) {
        console.error('Usage: node scripts/audit-backup-manifest-diff.mjs <oldManifest> <newManifest>');
        process.exit(1);
    }

    const oldRel = new Set(await loadManifest(oldPath));
    const newRel = new Set(await loadManifest(newPath));

    const removed = [...oldRel].filter((p) => !newRel.has(p)).sort();
    const added = [...newRel].filter((p) => !oldRel.has(p)).sort();

    console.log(`Old: ${path.resolve(oldPath)} (${oldRel.size} paths)`);
    console.log(`New: ${path.resolve(newPath)} (${newRel.size} paths)`);
    console.log(`Removed from manifest: ${removed.length}`);
    console.log(`Added to manifest: ${added.length}`);

    if (removed.length > 0) {
        console.log('\nFirst 20 removed paths:');
        for (const p of removed.slice(0, 20)) {
            console.log(`  - ${p}`);
        }
        if (removed.length > 20) {
            console.log(`  ... and ${removed.length - 20} more`);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * API contract snapshot sync script.
 *
 * Usage:
 *   node scripts/sync-api-contract.mjs --update   # Fetch and save openapi.json
 *   node scripts/sync-api-contract.mjs --check    # Compare local snapshot with live backend
 *   node scripts/sync-api-contract.mjs --diff     # Copy from sibling repo (no backend needed)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '..', 'api-contract', 'openapi.json');
const SIBLING_PATH = resolve(__dirname, '..', '..', 'image-scoring', 'openapi.json');
const BACKEND_URL = process.env.API_URL || 'http://localhost:7860';

const mode = process.argv[2];

if (!['--update', '--check', '--diff'].includes(mode)) {
    console.error('Usage: sync-api-contract.mjs --update | --check | --diff');
    process.exit(1);
}

async function fetchOpenApi() {
    const url = `${BACKEND_URL}/openapi.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    return await res.json();
}

function readSnapshot() {
    if (!existsSync(SNAPSHOT_PATH)) return null;
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
}

function normalizeForComparison(obj) {
    return JSON.stringify(obj, null, 2);
}

async function main() {
    if (mode === '--diff') {
        // Copy from sibling repo without needing the backend running
        if (!existsSync(SIBLING_PATH)) {
            console.error(`Sibling repo openapi.json not found at: ${SIBLING_PATH}`);
            process.exit(1);
        }
        const source = readFileSync(SIBLING_PATH, 'utf-8');
        const current = existsSync(SNAPSHOT_PATH) ? readFileSync(SNAPSHOT_PATH, 'utf-8') : null;

        if (current && normalizeForComparison(JSON.parse(source)) === normalizeForComparison(JSON.parse(current))) {
            console.log('Snapshot is up to date with sibling repo.');
            return;
        }

        writeFileSync(SNAPSHOT_PATH, source);
        console.log(`Updated snapshot from ${SIBLING_PATH}`);
        return;
    }

    if (mode === '--update') {
        let schema;
        try {
            schema = await fetchOpenApi();
        } catch {
            // Fallback to sibling repo file
            if (existsSync(SIBLING_PATH)) {
                console.log('Backend not reachable, copying from sibling repo...');
                const source = readFileSync(SIBLING_PATH, 'utf-8');
                writeFileSync(SNAPSHOT_PATH, source);
                console.log(`Updated snapshot from ${SIBLING_PATH}`);
                return;
            }
            console.error('Backend not reachable and sibling repo openapi.json not found.');
            process.exit(1);
        }
        const formatted = JSON.stringify(schema, null, 2) + '\n';
        writeFileSync(SNAPSHOT_PATH, formatted);
        console.log(`Updated snapshot at ${SNAPSHOT_PATH}`);
        return;
    }

    if (mode === '--check') {
        const current = readSnapshot();
        if (!current) {
            console.error('No snapshot found. Run with --update first.');
            process.exit(1);
        }

        let live;
        try {
            live = await fetchOpenApi();
        } catch {
            // Fallback: compare with sibling repo file
            if (existsSync(SIBLING_PATH)) {
                live = JSON.parse(readFileSync(SIBLING_PATH, 'utf-8'));
                console.log('(Comparing against sibling repo file — backend not reachable)');
            } else {
                console.error('Cannot check: backend not reachable and sibling openapi.json not found.');
                process.exit(1);
            }
        }

        const currentStr = normalizeForComparison(current);
        const liveStr = normalizeForComparison(live);

        if (currentStr === liveStr) {
            console.log('API contract snapshot is up to date.');
        } else {
            console.error('API contract has drifted! Run `npm run contract:update` to refresh.');

            // Show which top-level paths changed
            const currentPaths = new Set(Object.keys(current.paths || {}));
            const livePaths = new Set(Object.keys(live.paths || {}));
            const added = [...livePaths].filter((p) => !currentPaths.has(p));
            const removed = [...currentPaths].filter((p) => !livePaths.has(p));

            if (added.length) console.error('  New endpoints:', added.join(', '));
            if (removed.length) console.error('  Removed endpoints:', removed.join(', '));

            // Show which schemas changed
            const currentSchemas = new Set(Object.keys(current.components?.schemas || {}));
            const liveSchemas = new Set(Object.keys(live.components?.schemas || {}));
            const addedSchemas = [...liveSchemas].filter((s) => !currentSchemas.has(s));
            const removedSchemas = [...currentSchemas].filter((s) => !liveSchemas.has(s));

            if (addedSchemas.length) console.error('  New schemas:', addedSchemas.join(', '));
            if (removedSchemas.length) console.error('  Removed schemas:', removedSchemas.join(', '));

            process.exit(1);
        }
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});

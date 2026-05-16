#!/usr/bin/env node
/**
 * API contract snapshot sync script.
 *
 * Usage:
 *   node scripts/sync-api-contract.mjs --update   # Fetch and save openapi.json (fallback to ../image-scoring-backend/openapi.json)
 *   node scripts/sync-api-contract.mjs --check    # Compare local snapshot with live backend (fallback to sibling backend file)
 *   node scripts/sync-api-contract.mjs --diff     # Copy from ../image-scoring-backend/openapi.json (no backend needed)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '..', 'api-contract', 'openapi.json');
const SIBLING_PATH = resolve(__dirname, '..', '..', 'image-scoring-backend', 'openapi.json');
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
    const sortObjectKeysDeep = (value) => {
        if (Array.isArray(value)) {
            return value.map(sortObjectKeysDeep);
        }
        if (value && typeof value === 'object') {
            const sorted = {};
            for (const key of Object.keys(value).sort()) {
                sorted[key] = sortObjectKeysDeep(value[key]);
            }
            return sorted;
        }
        return value;
    };
    return JSON.stringify(sortObjectKeysDeep(obj), null, 2);
}

function ensureSiblingOpenApiExists(contextMessage) {
    if (existsSync(SIBLING_PATH)) return;
    console.error(`[contract:${mode?.replace('--', '') ?? 'unknown'}] Missing sibling backend OpenAPI file.`);
    console.error(`Expected: ${SIBLING_PATH}`);
    console.error(`Action: clone/open the backend repo as ../image-scoring-backend and generate openapi.json, then retry ${contextMessage}.`);
    process.exit(1);
}

async function main() {
    if (mode === '--diff') {
        // Copy from sibling backend repo without needing the backend running
        ensureSiblingOpenApiExists('`npm run contract:diff`');
        const source = readFileSync(SIBLING_PATH, 'utf-8');
        const current = existsSync(SNAPSHOT_PATH) ? readFileSync(SNAPSHOT_PATH, 'utf-8') : null;

        if (current && normalizeForComparison(JSON.parse(source)) === normalizeForComparison(JSON.parse(current))) {
            console.log('Snapshot is up to date with sibling backend repo.');
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
            // Fallback to sibling backend repo file
            if (existsSync(SIBLING_PATH)) {
                console.log('Backend not reachable, copying from sibling backend repo...');
                const source = readFileSync(SIBLING_PATH, 'utf-8');
                writeFileSync(SNAPSHOT_PATH, source);
                console.log(`Updated snapshot from ${SIBLING_PATH}`);
                return;
            }
            ensureSiblingOpenApiExists('`npm run contract:update`');
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
            // Fallback: compare with sibling backend repo file
            if (existsSync(SIBLING_PATH)) {
                live = JSON.parse(readFileSync(SIBLING_PATH, 'utf-8'));
                console.log('(Comparing against sibling backend repo file — backend not reachable)');
            } else {
                ensureSiblingOpenApiExists('`npm run contract:check`');
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

#!/usr/bin/env node

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '..', 'api-contract', 'openapi.json');
const OUTPUT_PATH = resolve(__dirname, '..', 'electron', 'api.generated.ts');

function ensureSnapshotExists() {
    if (existsSync(SNAPSHOT_PATH)) return;

    console.error('[generate:api-types] Missing backend OpenAPI snapshot.');
    console.error(`Expected: ${SNAPSHOT_PATH}`);
    console.error('Action: run `npm run contract:update`, then re-run `npm run generate:api-types`.');
    process.exit(1);
}

ensureSnapshotExists();

const result = spawnSync('npx', ['openapi-typescript', SNAPSHOT_PATH, '-o', OUTPUT_PATH], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
});

if (result.status !== 0) {
    process.exit(result.status ?? 1);
}

console.log(`[generate:api-types] Wrote API types to ${OUTPUT_PATH}`);

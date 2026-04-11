#!/usr/bin/env node

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIBLING_OPENAPI_PATH = resolve(__dirname, '..', '..', 'image-scoring-backend', 'openapi.json');
const OUTPUT_PATH = resolve(__dirname, '..', 'electron', 'api.generated.ts');

function ensureSiblingOpenApiExists() {
    if (existsSync(SIBLING_OPENAPI_PATH)) return;

    console.error('[generate:api-types] Missing sibling backend OpenAPI file.');
    console.error(`Expected: ${SIBLING_OPENAPI_PATH}`);
    console.error('Action: clone/open the backend repo as ../image-scoring-backend and generate openapi.json, then re-run `npm run generate:api-types`.');
    process.exit(1);
}

ensureSiblingOpenApiExists();

const result = spawnSync('npx', ['openapi-typescript', SIBLING_OPENAPI_PATH, '-o', OUTPUT_PATH], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
});

if (result.status !== 0) {
    process.exit(result.status ?? 1);
}

console.log(`[generate:api-types] Wrote API types to ${OUTPUT_PATH}`);

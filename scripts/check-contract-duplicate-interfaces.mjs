#!/usr/bin/env node
/**
 * Fails when duplicate exported TypeScript interface names are found
 * inside API contract type files.
 *
 * Usage:
 *   node scripts/check-contract-duplicate-interfaces.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CONTRACT_TYPE_FILES = [
    resolve(REPO_ROOT, 'electron', 'apiTypes.ts'),
    resolve(REPO_ROOT, 'electron', 'api.generated.ts'),
];

function extractDuplicateExportedInterfaces(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const counts = new Map();
    const interfaceRegex = /export\s+interface\s+(\w+)/g;
    let match;

    while ((match = interfaceRegex.exec(content)) !== null) {
        const name = match[1];
        counts.set(name, (counts.get(name) || 0) + 1);
    }

    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([name, count]) => ({ name, count }));
}

function main() {
    const issues = [];

    for (const filePath of CONTRACT_TYPE_FILES) {
        const duplicates = extractDuplicateExportedInterfaces(filePath);
        for (const duplicate of duplicates) {
            issues.push(
                `${relative(REPO_ROOT, filePath)}: '${duplicate.name}' is exported ${duplicate.count} times`,
            );
        }
    }

    if (issues.length > 0) {
        console.error('Duplicate exported interface names detected in API contract files:');
        for (const issue of issues) {
            console.error(`  - ${issue}`);
        }
        process.exit(1);
    }

    console.log('No duplicate exported interface names found in API contract files.');
}

main();

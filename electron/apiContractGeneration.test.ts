import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('API type generation source', () => {
    const directories: string[] = [];
    afterEach(() => {
        for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
    });

    it('generates from the consumer snapshot even when the sibling export is stale', () => {
        const root = mkdtempSync(join(tmpdir(), 'gallery-contract-'));
        directories.push(root);
        const consumer = join(root, 'gallery');
        for (const folder of ['scripts', 'electron', 'api-contract']) mkdirSync(join(consumer, folder), { recursive: true });
        mkdirSync(join(root, 'image-scoring-pipeline'));
        const schema = (path: string) => ({ openapi: '3.0.3', info: { title: 'Contract test', version: '1' },
            paths: { [path]: { get: { responses: { '200': { description: 'OK' } } } } } });
        writeFileSync(join(consumer, 'api-contract/openapi.json'), JSON.stringify(schema('/snapshot-only')));
        writeFileSync(join(root, 'image-scoring-pipeline/openapi.json'), JSON.stringify(schema('/stale-sibling')));
        const script = join(consumer, 'scripts/generate-api-types.mjs');
        writeFileSync(script, readFileSync(resolve('scripts/generate-api-types.mjs')));
        const result = spawnSync(process.execPath, [script], {
            cwd: process.cwd(), encoding: 'utf8', timeout: 25000,
            env: { ...process.env, npm_config_offline: 'true' },
        });
        expect(result.status, result.stderr || result.stdout).toBe(0);
        const generated = readFileSync(join(consumer, 'electron/api.generated.ts'), 'utf8');
        expect(generated).toContain('"/snapshot-only"');
        expect(generated).not.toContain('"/stale-sibling"');
    }, 30000);
});

#!/usr/bin/env node
/**
 * Validates that apiTypes.ts covers the OpenAPI schema endpoints and models.
 *
 * Checks:
 * 1. Every OpenAPI endpoint has a corresponding method in apiService.ts
 * 2. Every OpenAPI schema/model has a corresponding interface in apiTypes.ts
 * 3. Field names in TypeScript interfaces match OpenAPI schema properties
 *
 * Usage:
 *   node scripts/validate-api-types.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '..', 'api-contract', 'openapi.json');
const API_TYPES_PATH = resolve(__dirname, '..', 'electron', 'apiTypes.ts');
const API_SERVICE_PATH = resolve(__dirname, '..', 'electron', 'apiService.ts');

function loadOpenApiSpec() {
    if (!existsSync(SNAPSHOT_PATH)) {
        console.error(`OpenAPI snapshot not found at ${SNAPSHOT_PATH}. Run 'npm run contract:update' first.`);
        process.exit(1);
    }
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
}

function extractTsInterfaces(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const interfaces = new Map();

    // Match exported interfaces and their field names
    const interfaceRegex = /export\s+interface\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;

    while ((match = interfaceRegex.exec(content)) !== null) {
        const name = match[1];
        const body = match[2];
        // Extract field names (word before colon, ignoring comments)
        const fields = [];
        for (const line of body.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || !trimmed) continue;
            const fieldMatch = trimmed.match(/^(\w+)\??:/);
            if (fieldMatch) fields.push(fieldMatch[1]);
        }
        interfaces.set(name, fields);
    }

    return interfaces;
}

function extractServiceEndpoints(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const endpoints = new Set();

    // Match this.get/this.post calls with API paths
    const callRegex = /this\.(get|post)<[^>]+>\(\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = callRegex.exec(content)) !== null) {
        endpoints.add(match[2]);
    }

    return endpoints;
}

function main() {
    const spec = loadOpenApiSpec();
    const tsInterfaces = extractTsInterfaces(API_TYPES_PATH);
    const serviceEndpoints = extractServiceEndpoints(API_SERVICE_PATH);

    const issues = [];
    let checks = 0;

    // 1. Check endpoint coverage
    const openApiPaths = Object.keys(spec.paths || {});
    for (const path of openApiPaths) {
        checks++;
        // Normalize: OpenAPI uses /api/scoring/start, service uses /api/scoring/start
        if (!serviceEndpoints.has(path)) {
            // Check if it's a parameterized path like /api/images/{image_id}
            const pattern = path.replace(/\{[^}]+\}/g, '\\d+');
            const hasMatch = [...serviceEndpoints].some((ep) => {
                const epPattern = ep.replace(/\$\{[^}]+\}/g, '\\d+');
                return epPattern === pattern || ep.includes(path.split('{')[0]);
            });
            if (!hasMatch) {
                issues.push(`[endpoint] ${path} — not found in apiService.ts`);
            }
        }
    }

    // 2. Check schema/model coverage
    const schemas = spec.components?.schemas || {};
    // Map OpenAPI model names to expected TS interface names
    const schemaNames = Object.keys(schemas);

    // Known mappings between OpenAPI and TS names
    const IGNORED_SCHEMAS = new Set([
        'HTTPValidationError', 'ValidationError', 'Body_tag_propagation_api_tagging_propagate_post',
    ]);

    for (const schemaName of schemaNames) {
        if (IGNORED_SCHEMAS.has(schemaName)) continue;
        checks++;

        // Try exact match and common variations
        const candidates = [schemaName, schemaName.replace('Request', 'Request'), schemaName.replace('Response', 'Response')];
        const found = candidates.some((c) => tsInterfaces.has(c));

        if (!found) {
            issues.push(`[schema] ${schemaName} — no matching interface in apiTypes.ts`);
        }
    }

    // 3. Check field-level coverage for matched schemas
    for (const [schemaName, schemaDef] of Object.entries(schemas)) {
        if (IGNORED_SCHEMAS.has(schemaName)) continue;
        if (!tsInterfaces.has(schemaName)) continue;

        const tsFields = tsInterfaces.get(schemaName);
        const schemaProps = Object.keys(schemaDef.properties || {});

        for (const prop of schemaProps) {
            checks++;
            if (!tsFields.includes(prop)) {
                issues.push(`[field] ${schemaName}.${prop} — missing in TypeScript interface`);
            }
        }

        for (const field of tsFields) {
            checks++;
            if (!schemaProps.includes(field)) {
                issues.push(`[field] ${schemaName}.${field} — extra field not in OpenAPI schema`);
            }
        }
    }

    // Report
    console.log(`\nAPI Contract Validation`);
    console.log(`======================`);
    console.log(`Checks: ${checks}`);
    console.log(`TypeScript interfaces: ${tsInterfaces.size}`);
    console.log(`OpenAPI schemas: ${schemaNames.length}`);
    console.log(`Service endpoints: ${serviceEndpoints.size}`);
    console.log(`OpenAPI endpoints: ${openApiPaths.length}`);

    if (issues.length === 0) {
        console.log(`\nAll checks passed.`);
    } else {
        console.log(`\nIssues found: ${issues.length}`);
        for (const issue of issues) {
            console.log(`  - ${issue}`);
        }
        console.log(`\nNote: Some mismatches may be expected (different naming conventions, internal endpoints).`);
        console.log(`Review the issues above and update apiTypes.ts or the ignore list as needed.`);
        process.exit(1);
    }
}

main();

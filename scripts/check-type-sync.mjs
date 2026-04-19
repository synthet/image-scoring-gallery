#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const ELECTRON_TYPES = resolve(ROOT, 'electron/types.ts');
const RENDERER_DECL = resolve(ROOT, 'src/electron.d.ts');

function read(filePath) {
  return readFileSync(filePath, 'utf8');
}

function parseExportedTypeNames(source) {
  const names = new Set();
  const regex = /^export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/gm;
  let match;
  while ((match = regex.exec(source)) !== null) {
    names.add(match[1]);
  }
  return names;
}

function parseNamedTypeClause(source, keyword) {
  const regex = new RegExp(`${keyword}\\s+type\\s+\\{([\\s\\S]*?)\\}\\s+from\\s+['\"]\\.\\.\\/electron\\/types['\"]`, 'm');
  const match = source.match(regex);
  if (!match) {
    return null;
  }

  const names = new Set();
  for (const rawLine of match[1].split('\n')) {
    const trimmed = rawLine.replace(/\/\/.*$/, '').trim();
    if (!trimmed) continue;
    const normalized = trimmed.replace(/,$/, '');
    const local = normalized.split(/\s+as\s+/)[0].trim();
    if (local) {
      names.add(local);
    }
  }
  return names;
}

function diff(setA, setB) {
  return [...setA].filter((name) => !setB.has(name)).sort();
}

const electronTypesSource = read(ELECTRON_TYPES);
const rendererDeclSource = read(RENDERER_DECL);

const canonical = parseExportedTypeNames(electronTypesSource);
const imported = parseNamedTypeClause(rendererDeclSource, 'import');
const reexported = parseNamedTypeClause(rendererDeclSource, 'export');

const errors = [];

if (!imported) {
  errors.push("Missing `import type { ... } from '../electron/types'` in src/electron.d.ts.");
}

if (!reexported) {
  errors.push("Missing `export type { ... } from '../electron/types'` in src/electron.d.ts.");
}

if (imported && reexported) {
  const importOnly = diff(imported, reexported);
  const exportOnly = diff(reexported, imported);
  if (importOnly.length || exportOnly.length) {
    errors.push(`Import/export type lists are out of sync. import-only: [${importOnly.join(', ')}], export-only: [${exportOnly.join(', ')}].`);
  }

  const missingFromCanonical = diff(imported, canonical);
  if (missingFromCanonical.length) {
    errors.push(`src/electron.d.ts references unknown canonical types: [${missingFromCanonical.join(', ')}].`);
  }
}

if (errors.length) {
  console.error('Type sync check failed.');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Type sync check passed: src/electron.d.ts imports/re-exports canonical types from electron/types.ts.');

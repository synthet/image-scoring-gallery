#!/usr/bin/env node
/**
 * CI guard: shared design package linked, no legacy Material success/danger hex in src.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src');
const LOCK = resolve(ROOT, 'package-lock.json');
const BANNED = ['#4caf50', '#f44336'];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path, files);
    } else if (/\.(tsx?|css|module\.css)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function checkLockfile() {
  let lock;
  try {
    lock = readFileSync(LOCK, 'utf8');
  } catch {
    console.error('design:check: package-lock.json missing — run npm install');
    process.exit(1);
  }
  if (!lock.includes('"@synthet/image-scoring-design"')) {
    console.error('design:check: @synthet/image-scoring-design not found in package-lock.json');
    process.exit(1);
  }
}

function checkBannedHex() {
  const hits = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      for (const hex of BANNED) {
        if (lower.includes(hex)) {
          hits.push({ file, line: i + 1, hex, snippet: line.trim() });
        }
      }
    }
  }
  if (hits.length > 0) {
    console.error('design:check: legacy Material hex found in src (use var(--color-success) / var(--color-danger)):');
    for (const h of hits) {
      console.error(`  ${h.file}:${h.line}  ${h.hex}  ${h.snippet}`);
    }
    process.exit(1);
  }
}

checkLockfile();
checkBannedHex();
console.log('design:check: OK');

#!/usr/bin/env node
/**
 * Lightweight environment check for image-scoring-gallery (Node, config, sibling backend).
 * Exit 0 on PASS or WARN, 1 on FAIL.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const lines = [];
const fails = [];
const warns = [];

function line(s) {
  lines.push(s);
}

line('Gallery Doctor Report');
line('=====================');
line('');
line('Runtime');
line(`- Node: ${process.version}`);
line(`- cwd: ${ROOT}`);

const cfgPath = join(ROOT, 'config.json');
if (!existsSync(cfgPath)) {
  line('- config.json: MISSING (copy from config.example.json if needed)');
  fails.push('config:missing');
} else {
  line('- config.json: OK');
}

const major = Number((process.version || 'v0').slice(1).split('.')[0] || 0);
if (major < 18) {
  line(`- Node version: WARN (expected >= 18, got ${process.version})`);
  warns.push('node:old');
} else {
  line('- Node version: OK (>= 18)');
}

line('');
line('Sibling backend (image-scoring-backend)');
const candidates = [
  join(ROOT, '..', 'image-scoring-backend', 'webui.lock'),
  join(ROOT, '..', 'image-scoring', 'webui.lock'),
];
let lockFound = null;
for (const p of candidates) {
  if (existsSync(p)) {
    lockFound = p;
    break;
  }
}
if (!lockFound) {
  line('- webui.lock: not found (backend not running or different clone layout)');
  warns.push('backend:lock_missing');
} else {
  try {
    const raw = readFileSync(lockFound, 'utf8');
    const j = JSON.parse(raw);
    line(`- webui.lock: OK (${lockFound})`);
    line(`  - port: ${j.port ?? '?'}`);
  } catch (e) {
    line(`- webui.lock: present but unreadable (${e})`);
    warns.push('backend:lock_parse');
  }
}

const overall = fails.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS';
line('');
line(`Overall: ${overall}`);
console.log(lines.join('\n'));
process.exit(fails.length ? 1 : 0);

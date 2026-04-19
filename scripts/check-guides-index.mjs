import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const docsGuidesDir = path.resolve('docs/guides');
const indexPath = path.join(docsGuidesDir, 'README.md');

const allGuideFiles = (await readdir(docsGuidesDir))
  .filter((file) => file.endsWith('.md') && file !== 'README.md')
  .sort();

const readmeContent = await readFile(indexPath, 'utf8');
const linkedTargets = new Set(
  [...readmeContent.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map(([, target]) => target.trim())
    .filter((target) => !target.startsWith('#'))
    .map((target) => target.split('#')[0])
    .map((target) => target.replace(/^\.\//, '')),
);

const missing = allGuideFiles.filter((file) => !linkedTargets.has(file));

if (missing.length > 0) {
  console.error('docs/guides/README.md is missing links to:');
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`Guides index is complete: ${allGuideFiles.length} guide file(s) linked.`);

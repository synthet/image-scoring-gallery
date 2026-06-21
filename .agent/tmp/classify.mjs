import pg from 'pg';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const missing = JSON.parse(fs.readFileSync('.agent/tmp/missing.json', 'utf8'));
const c = new pg.Client({ host: '127.0.0.1', port: 5432, database: 'image_scoring', user: 'postgres', password: 'postgres' });
await c.connect();

const cols = await c.query(`select column_name from information_schema.columns where table_name='deleted_images'`).catch(() => ({ rows: [] }));
console.log('deleted_images cols:', cols.rows.map((r) => r.column_name).join(', ') || '(no table)');

let onDisk = 0, notOnDisk = 0, tomb = 0;
const results = [];
for (const m of missing) {
  const ps = `Get-ChildItem 'D:\\Photos' -Recurse -File -Filter '${m.file}' | Where-Object { $_.FullName -like '*${m.date}*' } | Select-Object -First 1 -ExpandProperty FullName`;
  let disk = '';
  try { disk = execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8' }).trim(); } catch {}
  let t = 0;
  try {
    const r = await c.query(`select count(*) c from deleted_images where lower(file_name)=lower($1)`, [m.file]);
    t = parseInt(r.rows[0].c);
  } catch {}
  if (disk) onDisk++; else notOnDisk++;
  if (t > 0) tomb++;
  results.push({ date: m.date, file: m.file, onDisk: disk || null, tomb: t > 0 });
}
console.log(`\nclassified ${missing.length}: onDisk(not in DB)=${onDisk}, notOnDisk=${notOnDisk}, tombstoned=${tomb}`);
console.log('\nDETAIL:');
for (const r of results) console.log(`  ${r.date} ${r.file}  disk=${r.onDisk ? 'YES' : 'no'}  tomb=${r.tomb ? 'YES' : 'no'}`);
await c.end();

import pg from 'pg';
import { execSync } from 'node:child_process';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
// disk counts per date folder under D:\Photos
const ps = `Get-ChildItem 'D:\Photos' -Recurse -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } | ForEach-Object { '{0}|{1}' -f $_.Name, (Get-ChildItem $_.FullName -File).Count }`;
const out = execSync(`powershell -NoProfile -Command "${ps}"`, {encoding:'utf8', maxBuffer:1024*1024*64});
const disk = {};
for (const line of out.split(/\r?\n/)) { const m=line.trim().match(/^(\d{4}-\d{2}-\d{2})\|(\d+)$/); if(m){ disk[m[1]]=(disk[m[1]]||0)+parseInt(m[2]); } }
// DB counts per date (group by the YYYY-MM-DD segment in file_path)
const dbq = await c.query(`select substring(file_path from '(\d{4}-\d{2}-\d{2})') as d, count(*) c from images where file_path ilike '%/Photos/%' group by 1`);
const dbm = {}; for (const r of dbq.rows) if (r.d) dbm[r.d]=parseInt(r.c);
const dates = [...new Set([...Object.keys(disk), ...Object.keys(dbm)])].sort();
console.log('DATE        DISK    DB    DIFF(disk-db)');
let totMissing=0;
for (const d of dates) {
  const dk=disk[d]||0, db=dbm[d]||0, diff=dk-db;
  if (d >= '2026-04-01' || diff!==0) {
    const flag = diff>0 ? '  <== '+diff+' on disk not in DB' : (diff<0?'  (DB has more)':'');
    console.log(d.padEnd(12)+String(dk).padStart(5)+String(db).padStart(7)+String(diff).padStart(9)+flag);
  }
  if (diff>0) totMissing+=diff;
}
console.log('\nTOTAL on-disk files with no DB row (all dates):', totMissing);
await c.end();

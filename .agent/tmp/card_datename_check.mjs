import pg from 'pg';
import path from 'node:path';
import { ExifTool } from 'exiftool-vendored';
import { execSync } from 'node:child_process';

const c = new pg.Client({ host: '127.0.0.1', port: 5432, database: 'image_scoring', user: 'postgres', password: 'postgres' });
await c.connect();
// DB key set: "<date-in-path>|<lower filename>" for every NEF row
const rows = await c.query(
  `select substring(file_path from '([0-9]{4}-[0-9]{2}-[0-9]{2})') d, lower(file_name) fn from images where file_path ilike '%.NEF'`
);
const dbKeys = new Set();
let dbNoDate = 0;
for (const r of rows.rows) {
  if (r.d && r.fn) dbKeys.add(r.d + '|' + r.fn);
  else dbNoDate++;
}
console.log('DB NEF rows:', rows.rows.length, '| keyed:', dbKeys.size, '| rows w/o date-in-path:', dbNoDate);

const out = execSync(
  `powershell -NoProfile -Command "Get-ChildItem 'E:\\DCIM' -Recurse -File -Filter *.NEF | ForEach-Object { $_.FullName }"`,
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 128 }
);
const files = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
console.log('card NEF files:', files.length);

const et = new ExifTool({ maxProcs: 8 });
let done = 0;
const missing = [];
const noDate = [];
const batch = 64;
for (let i = 0; i < files.length; i += batch) {
  const slice = files.slice(i, i + batch);
  await Promise.all(
    slice.map(async (f) => {
      const base = path.basename(f);
      try {
        const t = await et.read(f, ['-fast2']);
        const dto = t.DateTimeOriginal ?? t.CreateDate ?? t.ModifyDate;
        let date = null;
        if (dto) {
          const raw = typeof dto === 'string' ? dto : String(dto);
          const m = raw.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/);
          if (m) date = `${m[1]}-${m[2]}-${m[3]}`;
        }
        if (!date) { noDate.push({ file: base }); return; }
        if (!dbKeys.has(date + '|' + base.toLowerCase())) missing.push({ file: base, date });
      } catch (e) {
        noDate.push({ file: base, err: String(e).slice(0, 60) });
      }
    })
  );
  done += slice.length;
  if (done % 2048 < batch) console.error('  scanned', done, '/', files.length);
}
await et.end();
await c.end();

const grp = (arr) => {
  const g = {};
  for (const x of arr) {
    const k = x.date || '(no-date)';
    g[k] = (g[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(g).sort());
};
import fsNode from 'node:fs';
fsNode.writeFileSync('.agent/tmp/missing.json', JSON.stringify(missing, null, 0));
console.log('\n=== Card NEF NOT found in DB by (date+filename):', missing.length, '===');
console.log(JSON.stringify(grp(missing)));
console.log('\n=== Card NEF with no EXIF date read:', noDate.length, '===');
if (missing.length) {
  console.log('\nfirst 50 missing:');
  for (const m of missing.slice(0, 50)) console.log(' ', m.date, m.file);
}

import pg from 'pg';
import path from 'node:path';
import { ExifTool } from 'exiftool-vendored';
import { execSync } from 'node:child_process';

const c = new pg.Client({ host: '127.0.0.1', port: 5432, database: 'image_scoring', user: 'postgres', password: 'postgres' });
await c.connect();
const rows = await c.query(`select image_uuid from images where image_uuid is not null and image_uuid<>''`);
const dbUuids = new Set(rows.rows.map((r) => r.image_uuid.toLowerCase()));
console.log('DB uuid set size:', dbUuids.size);

const out = execSync(
  `powershell -NoProfile -Command "Get-ChildItem 'E:\\DCIM' -Recurse -File -Filter *.NEF | ForEach-Object { $_.FullName }"`,
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 128 }
);
const files = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
console.log('card NEF files:', files.length);

const et = new ExifTool({ maxProcs: 8 });
let done = 0;
const missing = [];
const noId = [];
const batch = 64;
for (let i = 0; i < files.length; i += batch) {
  const slice = files.slice(i, i + batch);
  await Promise.all(
    slice.map(async (f) => {
      const base = path.basename(f);
      try {
        const t = await et.read(f);
        const uid = t.ImageUniqueID ?? t.DocumentID ?? null;
        const dto = t.DateTimeOriginal ?? t.CreateDate ?? t.ModifyDate;
        let date = null;
        if (dto) {
          const raw = typeof dto === 'string' ? dto : String(dto);
          const m = raw.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/);
          if (m) date = `${m[1]}-${m[2]}-${m[3]}`;
        }
        if (uid && typeof uid === 'string') {
          if (!dbUuids.has(uid.toLowerCase())) missing.push({ file: base, date, uid });
        } else {
          noId.push({ file: base, date });
        }
      } catch (e) {
        noId.push({ file: base, date: null, err: String(e).slice(0, 60) });
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
console.log('\n=== Card NEF with a UUID NOT in DB (truly missing):', missing.length, '===');
console.log(JSON.stringify(grp(missing)));
console.log('\n=== Card NEF with NO embedded UUID (filename fallback needed):', noId.length, '===');
console.log(JSON.stringify(grp(noId)));
if (missing.length) {
  console.log('\nfirst 40 missing:');
  for (const m of missing.slice(0, 40)) console.log(' ', m.date, m.file, m.uid);
}

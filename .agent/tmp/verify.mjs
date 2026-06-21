import pg from 'pg';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
for (const d of ['2026-06-06','2026-06-07']) {
  const r = await c.query(`select count(*) c from images where file_path ilike '%/Photos/%'||$1||'%' and file_path ilike '%.NEF'`, [d]);
  console.log(d, 'NEF rows in DB:', r.rows[0].c);
}
await c.end();

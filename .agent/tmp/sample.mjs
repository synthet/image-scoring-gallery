import pg from 'pg';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
const s = await c.query(`select file_path from images where file_path ilike '%2026-06-07%' limit 3`);
console.log('sample 06-07 paths:'); s.rows.forEach(r=>console.log('  '+r.file_path));
const s2 = await c.query(`select file_path from images where file_path ilike '%Photos%' limit 3`);
console.log('sample Photos paths:'); s2.rows.forEach(r=>console.log('  '+r.file_path));
await c.end();

import pg from 'pg';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
const tot = await c.query(`select count(*) c from images where file_path ilike '%.NEF'`);
const wu = await c.query(`select count(*) c from images where file_path ilike '%.NEF' and image_uuid is not null and image_uuid<>''`);
console.log('NEF rows total:', tot.rows[0].c, '| with uuid:', wu.rows[0].c);
const samp = await c.query(`select image_uuid from images where file_path ilike '%2026-06-06%' and image_uuid is not null limit 3`);
console.log('sample uuids:', samp.rows.map(r=>r.image_uuid));
await c.end();

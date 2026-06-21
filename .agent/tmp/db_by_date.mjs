import pg from 'pg';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
const q = await c.query(`select substring(file_path from '([0-9]{4}-[0-9]{2}-[0-9]{2})') as d, count(*) c from images where file_path ilike '%/Photos/%' group by 1 having substring(file_path from '([0-9]{4}-[0-9]{2}-[0-9]{2})') >= '2026-04-01' order by 1`);
console.log('DB_DATE COUNT');
for (const r of q.rows) console.log(r.d, r.c);
await c.end();

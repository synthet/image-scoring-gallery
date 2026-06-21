import pg from 'pg';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
// find the path-ish column
const cols = await c.query(`select column_name from information_schema.columns where table_name='images' order by ordinal_position`);
console.log('COLUMNS:', cols.rows.map(r=>r.column_name).join(', '));
const tot = await c.query('select count(*) from images');
console.log('TOTAL images:', tot.rows[0].count);
await c.end();

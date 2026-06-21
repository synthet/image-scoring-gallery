import pg from 'pg';
import fs from 'node:fs';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
const q = await c.query(`select substring(file_path from '([0-9]{4}-[0-9]{2}-[0-9]{2})') as d, count(*) c from images where file_path ilike '%/Photos/%' and file_path ilike '%.NEF' group by 1`);
const db={}; for(const r of q.rows) if(r.d) db[r.d]=parseInt(r.c);
const disk={};
for(const line of fs.readFileSync('.agent/tmp/nef_disk.txt','utf8').split(/\r?\n/)){
  const m=line.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d+)$/); if(m) disk[m[1]]=(disk[m[1]]||0)+parseInt(m[2]);
}
const dates=[...new Set([...Object.keys(disk),...Object.keys(db)])].sort();
console.log('DATE         NEF_DISK  DB   MISSING');
let tot=0;
for(const d of dates){const dk=disk[d]||0, b=db[d]||0, miss=dk-b; if(miss!==0){console.log(d.padEnd(13)+String(dk).padStart(6)+String(b).padStart(6)+String(miss).padStart(7)+(miss>0?'  <== stranded':'')); } if(miss>0)tot+=miss;}
console.log('\nTOTAL stranded NEF on disk but not in DB:', tot);
await c.end();

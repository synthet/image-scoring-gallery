import pg from 'pg';
import fs from 'node:fs';
const c = new pg.Client({ host:'127.0.0.1', port:5432, database:'image_scoring', user:'postgres', password:'postgres' });
await c.connect();
// DB NEF counts per date (any path) for 2026
const q = await c.query(`select substring(file_path from '([0-9]{4}-[0-9]{2}-[0-9]{2})') d, count(*) c from images where file_path ilike '%.NEF' group by 1`);
const db={}; for(const r of q.rows) if(r.d) db[r.d]=parseInt(r.c);
const e={};
for(const line of fs.readFileSync('.agent/tmp/e_by_date.txt','utf8').split(/\r?\n/)){
  const m=line.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d+)$/); if(m) e[m[1]]=parseInt(m[2]);
}
const dates=Object.keys(e).sort();
console.log('CARD-DATE    E:NEF   DB(same date)   DIFF');
let totShort=0;
for(const d of dates){
  const ec=e[d], bc=db[d]||0, diff=ec-bc;
  const flag = diff>0 ? '  <== '+diff+' card files not matched by date' : (diff<0?'  (DB has more — ok)':'  ok');
  console.log(d.padEnd(12)+String(ec).padStart(5)+String(bc).padStart(12)+String(diff).padStart(9)+flag);
  if(diff>0) totShort+=diff;
}
console.log('\nCARD NEF total:', Object.values(e).reduce((a,b)=>a+b,0));
console.log('Sum of positive per-date shortfalls (card>DB):', totShort);
await c.end();

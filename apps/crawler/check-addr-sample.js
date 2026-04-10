const { Pool } = require("pg");
const fs = require("fs"), path = require("path");
function loadEnv() {
  const r = {}; for (let l of fs.readFileSync(path.resolve(__dirname,"../../.env"),"utf8").split("\n")) {
    l = l.trim(); if (!l||l.startsWith("#")) continue;
    const eq = l.indexOf("="); if (eq<0) continue;
    r[l.slice(0,eq).trim()]=l.slice(eq+1).trim().replace(/^['"]/,"").replace(/['"]$/,"");
  } return r;
}
const ENV = loadEnv();
const pool = new Pool({ connectionString: ENV.DATABASE_URL||ENV.DIRECT_URL, max:1, statement_timeout:10000 });
pool.connect().then(async c => {
  const { rows } = await c.query(`SELECT "rawJson"->>'ntceInsttAddr' AS addr FROM "Announcement" WHERE deadline > NOW() AND region='' LIMIT 15`);
  rows.forEach(r => console.log(JSON.stringify(r.addr)));
  c.release(); await pool.end();
}).catch(e => { console.error(e.message); process.exit(1); });

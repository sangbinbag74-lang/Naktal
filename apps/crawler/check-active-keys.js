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
  // rawJson 키 목록
  const { rows } = await c.query(`SELECT "rawJson" FROM "Announcement" WHERE deadline > NOW() AND region='' LIMIT 3`);
  rows.forEach((r, i) => {
    console.log(`\n=== 샘플 ${i+1} rawJson 키 ===`);
    if (r.rawJson) console.log(Object.keys(r.rawJson).join(", "));
    else console.log("(null)");
  });
  // region 관련 키 있는지 확인
  const { rows: addr } = await c.query(`SELECT "rawJson"->>'demInsttNm' AS dem, "rawJson"->>'ntceInsttNm' AS ntce, region, "orgName" FROM "Announcement" WHERE deadline > NOW() LIMIT 5`);
  console.log("\n=== orgName / region / ntceInsttNm 샘플 ===");
  addr.forEach(r => console.log(JSON.stringify(r)));
  c.release(); await pool.end();
}).catch(e => { console.error(e.message); process.exit(1); });

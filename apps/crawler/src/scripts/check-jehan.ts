import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const r = await p.query(`SELECT "rawJson"->>'cntrctMthdNm' AS m1, "rawJson"->>'cntrctCnclsMthdNm' AS m2, "rawJson"->>'bidMthdNm' AS m3 FROM "Announcement" WHERE title='다산로 생활녹지축 조성 공사' LIMIT 3`);
    for (const row of r.rows) console.log("  cntrctMthdNm:", row.m1, "| cntrctCnclsMthdNm:", row.m2, "| bidMthdNm:", row.m3);
    console.log("\n=== 제한경쟁 distinct values (cntrctCnclsMthdNm) ===");
    const r2 = await p.query(`SELECT "rawJson"->>'cntrctCnclsMthdNm' AS v, COUNT(*) FROM "Announcement" WHERE deadline > NOW() GROUP BY v ORDER BY count DESC LIMIT 15`);
    for (const row of r2.rows) console.log(" ", row.v, "->", row.count);
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });

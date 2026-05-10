import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 활성 MV 만 조회 (전체 7M 스캔 회피)
    console.log("=== AnnouncementActive cntrctCnclsMthdNm ===");
    const r1 = await p.query(`
      SELECT "rawJson"->>'cntrctCnclsMthdNm' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive"
      GROUP BY v
      ORDER BY cnt DESC
    `);
    for (const row of r1.rows) console.log(" ", JSON.stringify(row.v).padEnd(40), "->", row.cnt);

    console.log("\n=== AnnouncementActive cntrctMthdNm ===");
    const r2 = await p.query(`
      SELECT "rawJson"->>'cntrctMthdNm' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive"
      GROUP BY v
      ORDER BY cnt DESC
    `);
    for (const row of r2.rows) console.log(" ", JSON.stringify(row.v).padEnd(40), "->", row.cnt);

    console.log("\n=== AnnouncementActive bidMthdNm ===");
    const r3 = await p.query(`
      SELECT "rawJson"->>'bidMthdNm' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive"
      GROUP BY v
      ORDER BY cnt DESC
    `);
    for (const row of r3.rows) console.log(" ", JSON.stringify(row.v).padEnd(40), "->", row.cnt);
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });

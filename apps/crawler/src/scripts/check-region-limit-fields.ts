import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    console.log("=== 활성 공고 bidPrtcptLmtYn 분포 ===");
    const r1 = await p.query(`
      SELECT "rawJson"->>'bidPrtcptLmtYn' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive"
      GROUP BY v ORDER BY cnt DESC
    `);
    for (const row of r1.rows) console.log(" ", JSON.stringify(row.v).padEnd(15), "->", row.cnt);

    console.log("\n=== prtcptPsblRgnNm 분포 (상위 20) ===");
    const r2 = await p.query(`
      SELECT "rawJson"->>'prtcptPsblRgnNm' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive"
      GROUP BY v ORDER BY cnt DESC LIMIT 20
    `);
    for (const row of r2.rows) console.log(" ", JSON.stringify(row.v).padEnd(40), "->", row.cnt);

    console.log("\n=== jntcontrctDutyRgnNm1 분포 (상위 15) ===");
    const r3 = await p.query(`
      SELECT "rawJson"->>'jntcontrctDutyRgnNm1' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive"
      GROUP BY v ORDER BY cnt DESC LIMIT 15
    `);
    for (const row of r3.rows) console.log(" ", JSON.stringify(row.v).padEnd(40), "->", row.cnt);

    console.log("\n=== 문제 공고 (가로수 결주지 보식사업) 전체 raw 필드 ===");
    const r4 = await p.query(`
      SELECT "rawJson" FROM "AnnouncementActive"
      WHERE title ILIKE '%가로수 결주지 보식%' LIMIT 1
    `);
    if (r4.rows[0]) {
      const rj = r4.rows[0].rawJson;
      const keys = Object.keys(rj).filter(k =>
        k.toLowerCase().includes("rgn") ||
        k.toLowerCase().includes("lmt") ||
        k.toLowerCase().includes("prtcpt") ||
        k === "dminsttNm" || k === "ntceInsttNm" || k === "cnstrtsiteRgnNm"
      );
      for (const k of keys) console.log(" ", k.padEnd(35), "=", JSON.stringify(rj[k]));
    }
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });

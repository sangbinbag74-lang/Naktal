import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const r = await p.query(`SELECT id, "konepsId", title, "rawJson"->>'bidPrtcptLmtYn' AS lmt, "rawJson"->>'cnstrtsiteRgnNm' AS site, "rawJson"->>'cntrctCnclsMthdNm' AS m, "rawJson"->>'ntceSpecDocUrl1' AS pdf FROM "Announcement" WHERE "konepsId"='R26BK01510308' OR title ILIKE '%2026년 가로수 결주지%'`);
    for (const row of r.rows) {
      console.log("  konepsId:", row.konepsId);
      console.log("  title:", row.title);
      console.log("  bidPrtcptLmtYn:", row.lmt);
      console.log("  cnstrtsiteRgnNm:", row.site);
      console.log("  cntrctCnclsMthdNm:", row.m);
      console.log("  PDF:", row.pdf);
      console.log();
    }
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });

import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDbUrl(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    if (t.slice(0, i).trim() === "DATABASE_URL") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 30000 });
  const r = await pool.query(`
    SELECT
      to_char(date_trunc('year', "openingDate"),'YYYY') AS y,
      COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1)>=4)::bigint AS f,
      COUNT(*)::bigint AS t
    FROM "BidOpeningDetail"
    WHERE "openingDate" >= '2002-01-01' AND "openingDate" < '2027-01-01'
    GROUP BY 1 ORDER BY 1
  `);
  process.stdout.write("연도별 selPrdprcIdx 채움 현황:\n");
  let totalF=0, totalT=0;
  for (const row of r.rows) {
    const f=Number(row.f), t=Number(row.t);
    const pct = t>0 ? (f/t*100).toFixed(1) : "0.0";
    process.stdout.write(`${row.y}: ${f}/${t} (${pct}%)\n`);
    totalF+=f; totalT+=t;
  }
  process.stdout.write(`전체: ${totalF}/${totalT} (${(totalF/totalT*100).toFixed(1)}%)\n`);
  await pool.end();
})();

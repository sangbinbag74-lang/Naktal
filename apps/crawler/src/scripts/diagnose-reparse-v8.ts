import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

(async () => {
  // 전체 분포
  const r1 = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "rawJson" IS NULL) AS no_raw,
      COUNT(*) FILTER (WHERE "rawJson" IS NOT NULL) AS has_raw,
      COUNT(*) FILTER (WHERE "rawJson" IS NOT NULL AND "rawJson" ? 'ciblAplYn') AS has_cibl,
      COUNT(*) FILTER (WHERE "rawJson" IS NOT NULL AND ("rawJson"->>'ciblAplYn') IS NOT NULL AND ("rawJson"->>'ciblAplYn') != '') AS cibl_nonempty,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '') AS col_filled,
      COUNT(*) FILTER (WHERE "deadline" IS NULL) AS no_deadline,
      COUNT(*) FILTER (WHERE "deadline" >= '2002-01-01' AND "deadline" < '2026-06-01') AS in_range
    FROM "Announcement"
  `);
  console.log("=== 진단 ===");
  for (const [k, v] of Object.entries(r1.rows[0])) {
    console.log(`  ${k}: ${Number(v).toLocaleString()}`);
  }

  // 샘플: ciblAplYn 컬럼 빈 행 + rawJson 의 ciblAplYn
  const r2 = await pool.query(`
    SELECT id,
      "ciblAplYn" AS col_val,
      "rawJson"->>'ciblAplYn' AS raw_val,
      "rawJson" IS NOT NULL AS has_raw,
      "deadline"
    FROM "Announcement"
    WHERE "ciblAplYn" = '' AND "rawJson" IS NOT NULL
    LIMIT 5
  `);
  console.log("\n=== ciblAplYn 빈 컬럼 + rawJson 있는 샘플 ===");
  for (const row of r2.rows) {
    console.log(`  col='${row.col_val}' raw='${row.raw_val}' deadline=${row.deadline?.toISOString().slice(0,10)}`);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

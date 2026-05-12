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
  // 단계별 단순 query
  console.log("1. rawJson NULL 카운트");
  const r1 = await pool.query(`SELECT COUNT(*) FROM "Announcement" WHERE "rawJson" IS NULL`);
  console.log(`  ${Number(r1.rows[0].count).toLocaleString()}`);

  console.log("\n2. ciblAplYn 빈 + rawJson 있는 샘플 5건");
  const r2 = await pool.query(`
    SELECT "ciblAplYn", "rawJson"->>'ciblAplYn' AS raw_cibl
    FROM "Announcement"
    WHERE "ciblAplYn" = '' AND "rawJson" IS NOT NULL
    LIMIT 5
  `);
  for (const row of r2.rows) console.log(`  col='${row.ciblAplYn}' raw='${row.raw_cibl}'`);

  console.log("\n3. ciblAplYn 빈 + rawJson 에 ciblAplYn 키 존재 카운트");
  const r3 = await pool.query(`
    SELECT COUNT(*)
    FROM "Announcement"
    WHERE "ciblAplYn" = '' AND "rawJson" ? 'ciblAplYn'
  `);
  console.log(`  ${Number(r3.rows[0].count).toLocaleString()}`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

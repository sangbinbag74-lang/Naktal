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
  console.log("1. ciblAplYn 빈 + rawJson 의 jsonb_typeof");
  const r1 = await pool.query(`
    SELECT
      jsonb_typeof("rawJson"->'ciblAplYn') AS jtype,
      COUNT(*)::int AS cnt
    FROM "Announcement"
    WHERE "ciblAplYn" = '' AND "rawJson" IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC
  `);
  for (const row of r1.rows) console.log(`  type=${row.jtype || "(missing)"}: ${Number(row.cnt).toLocaleString()}`);

  console.log("\n2. ciblAplYn != '' 인 행의 jsonb_typeof");
  const r2 = await pool.query(`
    SELECT
      jsonb_typeof("rawJson"->'ciblAplYn') AS jtype,
      COUNT(*)::int AS cnt
    FROM "Announcement"
    WHERE "ciblAplYn" != '' AND "rawJson" IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC
  `);
  for (const row of r2.rows) console.log(`  type=${row.jtype || "(missing)"}: ${Number(row.cnt).toLocaleString()}`);

  console.log("\n3. ciblAplYn 빈 + rawJson->>'ciblAplYn' 값 분포");
  const r3 = await pool.query(`
    SELECT
      "rawJson"->>'ciblAplYn' AS val,
      COUNT(*)::int AS cnt
    FROM "Announcement"
    WHERE "ciblAplYn" = '' AND "rawJson" IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 5
  `);
  for (const row of r3.rows) console.log(`  '${row.val}': ${Number(row.cnt).toLocaleString()}`);

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

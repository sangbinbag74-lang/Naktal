import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 30000 });

(async () => {
  const r = await pool.query(`
    SELECT pid, EXTRACT(EPOCH FROM (NOW() - query_start))::int AS dur_s, LEFT(query, 80) AS q
    FROM pg_stat_activity
    WHERE state = 'active' AND pid <> pg_backend_pid()
      AND EXTRACT(EPOCH FROM (NOW() - query_start)) > 1500
    ORDER BY query_start
  `);
  console.log(`Stuck 쿼리 (1500s+): ${r.rows.length}건`);
  for (const row of r.rows) {
    console.log(`  pid=${row.pid} dur=${row.dur_s}s q="${row.q}"`);
    const k = await pool.query(`SELECT pg_terminate_backend(${row.pid}) AS ok`);
    console.log(`    → terminate: ${k.rows[0].ok}`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

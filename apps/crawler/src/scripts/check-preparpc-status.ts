import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env.DATABASE_URL;
}
async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    const overall = await c.query<{ filled: string; total: string; pct: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1) > 0)::text AS filled,
        COUNT(*)::text AS total,
        ROUND(100.0 * COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1) > 0) / NULLIF(COUNT(*),0), 2)::text AS pct
      FROM "BidOpeningDetail"
    `);
    const r = overall.rows[0];
    console.log(`selPrdprcIdx 전체 채움율: ${r.filled} / ${r.total} = ${r.pct}%`);

    const yearly = await c.query<{ yr: string; filled: string; total: string; pct: string }>(`
      SELECT
        EXTRACT(YEAR FROM "openingDate")::text AS yr,
        COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1) > 0)::text AS filled,
        COUNT(*)::text AS total,
        ROUND(100.0 * COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1) > 0) / NULLIF(COUNT(*),0), 1)::text AS pct
      FROM "BidOpeningDetail"
      WHERE "openingDate" IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM "openingDate")
      ORDER BY 1
    `);
    console.log("\n연도별 채움율:");
    for (const row of yearly.rows) {
      const flag = parseFloat(row.pct) === 0 ? "❌ 0%" : parseFloat(row.pct) < 50 ? "⚠ <50%" : "✓";
      console.log(`  ${row.yr}: ${row.filled.padStart(8)} / ${row.total.padStart(8)} = ${row.pct.padStart(6)}%  ${flag}`);
    }
  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });

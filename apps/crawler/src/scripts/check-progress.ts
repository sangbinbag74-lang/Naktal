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
    const r = await c.query(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN "sucsfbidLwltRate" > 0 THEN 1 ELSE 0 END)::int AS llrate,
        SUM(CASE WHEN "bidNtceDtlUrl" != '' THEN 1 ELSE 0 END)::int AS url,
        SUM(CASE WHEN "ntceInsttOfclTelNo" != '' THEN 1 ELSE 0 END)::int AS tel,
        SUM(CASE WHEN "bsisAmt" > 0 THEN 1 ELSE 0 END)::int AS bsis,
        SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::int AS subcats,
        SUM(CASE WHEN "aValueDetails" IS NOT NULL THEN 1 ELSE 0 END)::int AS avalDet
      FROM "Announcement"
    `);
    const x = r.rows[0];
    const pct = (n: number) => ((n / x.total) * 100).toFixed(2);
    console.log(`=== 현재 DB 채움율 (${new Date().toISOString()}) ===\n`);
    console.log(`전체: ${x.total.toLocaleString()}\n`);
    console.log(`reparse-rawjson (rawJson 승격, API 0):`);
    console.log(`  sucsfbidLwltRate:   ${x.llrate.toLocaleString()} (${pct(x.llrate)}%)`);
    console.log(`  bidNtceDtlUrl:      ${x.url.toLocaleString()} (${pct(x.url)}%)`);
    console.log(`  ntceInsttOfclTelNo: ${x.tel.toLocaleString()} (${pct(x.tel)}%)`);
    console.log(`\nbulk-import-extras (API 수집):`);
    console.log(`  bsisAmt:       ${x.bsis.toLocaleString()} (${pct(x.bsis)}%)`);
    console.log(`  subCategories: ${x.subcats.toLocaleString()} (${pct(x.subcats)}%)`);
    console.log(`  aValueDetails: ${x.avaldet.toLocaleString()} (${pct(x.avaldet)}%)`);

    const t2 = await c.query(`SELECT COUNT(*)::int AS n FROM "BidOpeningDetail"`);
    const t3 = await c.query(`SELECT COUNT(*)::int AS n FROM "AnnouncementChgHst"`);
    console.log(`\n신규 테이블:`);
    console.log(`  BidOpeningDetail:   ${t2.rows[0].n.toLocaleString()}`);
    console.log(`  AnnouncementChgHst: ${t3.rows[0].n.toLocaleString()}`);
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);

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
        COUNT(*)::bigint AS total,
        SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::bigint AS sub,
        SUM(CASE WHEN "bsisAmt" > 0 THEN 1 ELSE 0 END)::bigint AS bsis,
        SUM(CASE WHEN "aValueTotal" > 0 THEN 1 ELSE 0 END)::bigint AS aval,
        SUM(CASE WHEN "rsrvtnPrceRngBgnRate" != 0 OR "rsrvtnPrceRngEndRate" != 0 THEN 1 ELSE 0 END)::bigint AS prc,
        SUM(CASE WHEN category = '외자' THEN 1 ELSE 0 END)::bigint AS frg
      FROM "Announcement"
    `);
    const x = r.rows[0];
    const t = Number(x.total);
    const pct = (n: string | number) => ((Number(n) / t) * 100).toFixed(2);
    console.log(`=== ${new Date().toISOString()} ===\n`);
    console.log(`Announcement 전체: ${t.toLocaleString()}`);
    console.log(`  subCategories  : ${Number(x.sub).toLocaleString()} (${pct(x.sub)}%)`);
    console.log(`  bsisAmt        : ${Number(x.bsis).toLocaleString()} (${pct(x.bsis)}%)`);
    console.log(`  aValueTotal    : ${Number(x.aval).toLocaleString()} (${pct(x.aval)}%)`);
    console.log(`  rsrvtnPrceRng  : ${Number(x.prc).toLocaleString()} (${pct(x.prc)}%)`);
    console.log(`  category=외자  : ${Number(x.frg).toLocaleString()} (${pct(x.frg)}%)`);

    const t2 = await c.query(`SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst"`);
    const t3 = await c.query(`SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail"`);
    let preCount = BigInt(0);
    try {
      const t4 = await c.query(`SELECT COUNT(*)::bigint AS n FROM "PreStdrd"`);
      preCount = BigInt(t4.rows[0].n);
    } catch {}
    console.log(`\n신규 테이블:`);
    console.log(`  AnnouncementChgHst : ${Number(t2.rows[0].n).toLocaleString()}`);
    console.log(`  BidOpeningDetail   : ${Number(t3.rows[0].n).toLocaleString()}`);
    console.log(`  PreStdrd           : ${Number(preCount).toLocaleString()}`);
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);

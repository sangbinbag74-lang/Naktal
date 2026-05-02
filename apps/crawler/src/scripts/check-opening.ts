import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  return process.env.DATABASE_URL!;
}

(async () => {
  const pool = new Pool({ connectionString: loadDatabaseUrl(), statement_timeout: 30000 });
  try {
    // pg_class estimate (instant)
    const r0 = await pool.query(
      `SELECT n_live_tup::bigint AS live FROM pg_stat_user_tables WHERE relname='BidOpeningDetail'`,
    );
    console.log("est:", r0.rows);

    // quick sample (no aggregate)
    const r1 = await pool.query(
      `SELECT "annId","selPrdprcIdx","bidCount","openingDate" FROM "BidOpeningDetail" LIMIT 5`,
    );
    console.log("samples:", JSON.stringify(r1.rows, null, 2));

    // Inspect rawJson to see if rlOpengRank / prdprcOrd exist
    const r2 = await pool.query(
      `SELECT "annId","bidCount","rawJson" FROM "BidOpeningDetail" WHERE "bidCount" >= 4 LIMIT 3`,
    );
    console.log("high_bid_samples:", JSON.stringify(r2.rows, null, 2));
  } catch (e) {
    console.error("ERR:", (e as Error).message);
  } finally {
    await pool.end();
  }
})();

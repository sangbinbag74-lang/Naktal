import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
  }
}
async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    const t = await c.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "BidOutcome"`);
    console.log(`BidOutcome total: ${t.rows[0].count}`);
    const f = await c.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "BidOutcome" WHERE "actualSajungRate" IS NOT NULL`);
    console.log(`actualSajungRate filled: ${f.rows[0].count}`);
    const r = await c.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "BidPricePrediction"`);
    console.log(`BidPricePrediction total: ${r.rows[0].count}`);
    const expired = await c.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "BidPricePrediction" WHERE "expiresAt" < NOW()`);
    console.log(`BidPricePrediction expired: ${expired.rows[0].count}`);
  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });

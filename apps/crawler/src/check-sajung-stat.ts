import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DATABASE_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    const total = await client.query(`SELECT COUNT(*)::int AS cnt FROM "SajungRateStat"`);
    console.log("총 SajungRateStat row:", total.rows[0].cnt);

    const bySample = await client.query(`
      SELECT
        CASE
          WHEN "sampleSize" < 5 THEN '1) <5'
          WHEN "sampleSize" < 10 THEN '2) 5~9'
          WHEN "sampleSize" < 30 THEN '3) 10~29'
          WHEN "sampleSize" < 100 THEN '4) 30~99'
          ELSE '5) 100+'
        END AS bucket,
        COUNT(*)::int AS cnt
      FROM "SajungRateStat" GROUP BY 1 ORDER BY 1
    `);
    console.log("sampleSize 분포:");
    for (const r of bySample.rows) console.log(` ${r.bucket}: ${r.cnt}`);

    const latest = await client.query(`
      SELECT MAX("updatedAt") AS latest FROM "SajungRateStat"
    `);
    console.log("최근 갱신:", latest.rows[0].latest);

    const allOrg = await client.query(`
      SELECT "category", "budgetRange", "region", "sampleSize", "avg"
      FROM "SajungRateStat"
      WHERE "orgName" = 'ALL'
      ORDER BY "sampleSize" DESC LIMIT 5
    `);
    console.log("ALL orgName 상위 5:", allOrg.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

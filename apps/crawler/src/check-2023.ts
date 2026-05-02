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
  const pool = new Pool({ connectionString: url!, max: 2 });
  const client = await pool.connect();
  try {
    console.log("=== 2023년 데이터 상세 조사 ===\n");

    const ann = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM "Announcement"
      WHERE EXTRACT(YEAR FROM deadline) = 2023
    `);
    console.log(`1. Announcement (2023 마감): ${ann.rows[0].cnt.toLocaleString()}건`);

    const bid = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE EXTRACT(YEAR FROM a.deadline) = 2023
    `);
    console.log(`2. BidResult JOIN (2023 마감): ${bid.rows[0].cnt.toLocaleString()}건`);

    const byMonth = await client.query(`
      SELECT TO_CHAR(deadline, 'YYYY-MM') AS m, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE deadline BETWEEN '2019-01-01' AND '2026-12-31'
      GROUP BY 1 ORDER BY 1
    `);
    console.log(`\n3. 2019~2026 월별 Announcement:`);
    let prev = "";
    for (const r of byMonth.rows) {
      const year = r.m.slice(0, 4);
      if (year !== prev) { console.log(`  --- ${year} ---`); prev = year; }
      console.log(`  ${r.m}: ${r.cnt.toLocaleString()}`);
    }

    const byMonthBid = await client.query(`
      SELECT TO_CHAR(a.deadline, 'YYYY-MM') AS m, COUNT(*)::int AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE a.deadline BETWEEN '2019-01-01' AND '2026-12-31'
      GROUP BY 1 ORDER BY 1
    `);
    console.log(`\n4. 2019~2026 월별 BidResult 매칭:`);
    prev = "";
    for (const r of byMonthBid.rows) {
      const year = r.m.slice(0, 4);
      if (year !== prev) { console.log(`  --- ${year} ---`); prev = year; }
      console.log(`  ${r.m}: ${r.cnt.toLocaleString()}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

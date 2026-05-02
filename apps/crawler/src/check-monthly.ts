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
  if (!url) {
    console.error("DATABASE_URL 없음");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    const ann = await client.query(`
      SELECT TO_CHAR(deadline, 'YYYY-MM') AS month, COUNT(*) AS cnt
      FROM "Announcement"
      WHERE deadline BETWEEN '2002-01-01' AND '2019-12-31'
      GROUP BY 1 ORDER BY 1
    `);
    const bid = await client.query(`
      SELECT TO_CHAR(a.deadline, 'YYYY-MM') AS month, COUNT(*) AS cnt
      FROM "BidResult" b
      JOIN "Announcement" a ON a."konepsId" = b."annId"
      WHERE a.deadline BETWEEN '2002-01-01' AND '2019-12-31'
      GROUP BY 1 ORDER BY 1
    `);

    const annMap = new Map<string, number>();
    const bidMap = new Map<string, number>();
    for (const r of ann.rows) annMap.set(r.month, Number(r.cnt));
    for (const r of bid.rows) bidMap.set(r.month, Number(r.cnt));

    const months: string[] = [];
    for (let y = 2002; y <= 2019; y++) {
      for (let m = 1; m <= 12; m++) {
        months.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }

    console.log("월별 공고 / 낙찰 (공고 0건 또는 낙찰 0건만 표시)");
    console.log("월      | 공고        | 낙찰");
    console.log("--------|-------------|-------------");
    let emptyAnn = 0, emptyBid = 0, bothOk = 0;
    for (const m of months) {
      const a = annMap.get(m) ?? 0;
      const b = bidMap.get(m) ?? 0;
      if (a === 0) emptyAnn++;
      if (b === 0) emptyBid++;
      if (a > 0 && b > 0) bothOk++;
      if (a === 0 || b === 0) {
        const aStr = a === 0 ? "❌ 0     " : String(a).padStart(10, " ");
        const bStr = b === 0 ? "❌ 0     " : String(b).padStart(10, " ");
        console.log(`${m} | ${aStr}  | ${bStr}`);
      }
    }

    let totalAnn = 0, totalBid = 0;
    for (const v of annMap.values()) totalAnn += v;
    for (const v of bidMap.values()) totalBid += v;
    console.log("\n=== 요약 ===");
    console.log(`전체 월 수: ${months.length}`);
    console.log(`공고/낙찰 둘 다 있음: ${bothOk}`);
    console.log(`공고 0건인 월: ${emptyAnn}`);
    console.log(`낙찰 0건인 월: ${emptyBid}`);
    console.log(`총 공고: ${totalAnn.toLocaleString()}`);
    console.log(`총 낙찰: ${totalBid.toLocaleString()}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

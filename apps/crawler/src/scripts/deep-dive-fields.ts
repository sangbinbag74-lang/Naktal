/**
 * G2B 공고 rawJson 전체 필드 심층 조사
 * indstrytyLmtYn=Y인 공고를 샘플링해 업종 관련 모든 필드 나열
 */
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
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 2 });
  const c = await pool.connect();
  try {
    // 1. indstrytyLmtYn='Y'인 최근 공고의 rawJson 전체 확인
    console.log("=== 최근 'indstrytyLmtYn=Y' 공고 rawJson 전체 덤프 (3건) ===");
    const r1 = await c.query(`
      SELECT title, "konepsId", category, "rawJson"
      FROM "Announcement"
      WHERE "rawJson"->>'indstrytyLmtYn' = 'Y'
      ORDER BY deadline DESC
      LIMIT 3
    `);
    for (const r of r1.rows) {
      console.log(`\n━━━━━━━━ [${r.konepsId}] ${r.title} (cat=${r.category}) ━━━━━━━━`);
      const raw = r.rawJson as Record<string, string>;
      for (const [k, v] of Object.entries(raw)) {
        if (v && String(v).trim() !== "") {
          const sv = String(v).length > 200 ? String(v).slice(0, 200) + "..." : String(v);
          console.log(`  ${k}: ${sv}`);
        }
      }
    }

    // 2. rawJson에 등장하는 모든 키 나열 (최근 100건 기준)
    console.log("\n\n=== rawJson에 등장하는 모든 키 (최근 시설공사 100건 분석) ===");
    const r2 = await c.query(`
      SELECT "rawJson"
      FROM "Announcement"
      WHERE category = '시설공사'
      ORDER BY deadline DESC
      LIMIT 100
    `);
    const keyCount: Record<string, number> = {};
    for (const row of r2.rows) {
      const raw = row.rawJson as Record<string, string>;
      for (const k of Object.keys(raw)) {
        keyCount[k] = (keyCount[k] ?? 0) + 1;
      }
    }
    const sortedKeys = Object.entries(keyCount).sort((a, b) => b[1] - a[1]);
    for (const [k, cnt] of sortedKeys) console.log(`  ${k}: ${cnt}`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(console.error);

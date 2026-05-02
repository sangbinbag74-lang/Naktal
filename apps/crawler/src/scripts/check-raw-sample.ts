/**
 * 공사 공고의 rawJson 샘플 확인 - 실제로 어떤 필드에 업종 정보가 있나
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
    // 최근 시설공사 공고 3건의 rawJson 샘플
    console.log("=== 최근 시설공사 공고 rawJson 키 분포 ===");
    const recent = await c.query(`
      SELECT title, "konepsId", "rawJson"
      FROM "Announcement"
      WHERE category = '시설공사'
        AND deadline > NOW() - INTERVAL '30 days'
      ORDER BY deadline DESC
      LIMIT 5
    `);
    for (const r of recent.rows) {
      console.log(`\n[${r.konepsId}] ${r.title}`);
      const raw = r.rawJson as Record<string, string>;
      const keys = Object.keys(raw);
      // 업종/공종 관련 필드만
      const relevant = keys.filter((k) =>
        /cnstty|indust|lrgClsfc|midClsfc|lmt|bsns/i.test(k),
      );
      for (const k of relevant) {
        const v = raw[k];
        if (v && v.trim() !== "") console.log(`  ${k} = ${v}`);
      }
    }

    // 조경 관련 공고에서 가능한 모든 필드 값
    console.log("\n\n=== '조경' 키워드 포함 공고의 필드 샘플 ===");
    const jk = await c.query(`
      SELECT title, "konepsId", category, "rawJson"
      FROM "Announcement"
      WHERE title ILIKE '%조경%'
      ORDER BY deadline DESC
      LIMIT 5
    `);
    for (const r of jk.rows) {
      console.log(`\n[${r.konepsId}] ${r.title} (category='${r.category}')`);
      const raw = r.rawJson as Record<string, string>;
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string" && v.includes("조경")) {
          console.log(`  ${k} = ${v}`);
        }
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(console.error);

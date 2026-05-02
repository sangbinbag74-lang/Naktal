/**
 * Announcement.rawJson 의 모든 필드 키 추출 — 적격심사/공동수급/수의 관련 찾기
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
function loadDbUrl(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    if (t.slice(0, i).trim() === "DATABASE_URL") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL!;
}
(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });
  // 공사/용역/물품 각 1건의 rawJson 키 출력
  for (const cat of ["공사", "용역", "물품"]) {
    const r = await pool.query(`SELECT "rawJson" FROM "Announcement" WHERE category LIKE $1 AND "rawJson" IS NOT NULL LIMIT 1`, [`%${cat}%`]);
    const row = r.rows[0] as { rawJson?: Record<string, unknown> } | undefined;
    if (row?.rawJson) {
      const keys = Object.keys(row.rawJson);
      process.stdout.write(`\n=== ${cat} (${keys.length} keys) ===\n`);
      // 적격심사/공동수급/수의 관련 키 필터
      const interesting = keys.filter((k) => /(?:Pyq|pyq|jnt|sde|sudey|qlfct|qualif|cnstrt|comp|comm|aply|stf)/i.test(k));
      process.stdout.write(`적격/공동수급/수의 관련:\n`);
      for (const k of interesting) {
        const v = row.rawJson[k];
        process.stdout.write(`  ${k}: ${JSON.stringify(v).slice(0, 80)}\n`);
      }
      process.stdout.write(`전체 키:\n  ${keys.join(", ")}\n`);
    }
  }
  await pool.end();
})();

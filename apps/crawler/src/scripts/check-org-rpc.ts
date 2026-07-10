/** 읽기 전용 — search_ann_nospace 등 검색 함수 정의 + nospace 인덱스 활용 가능성 확인 */
import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v; } throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();

  const fns = await c.query(`
    SELECT proname, pg_get_functiondef(oid) AS def
    FROM pg_proc
    WHERE proname ILIKE '%search%' OR proname ILIKE '%org%'
  `);
  for (const r of fns.rows) {
    console.log("=".repeat(70));
    console.log(r.proname);
    console.log(String(r.def).slice(0, 1600));
  }

  // nospace 식으로 직접 질의 시 성능 (인덱스 사용 검증)
  const t0 = Date.now();
  const test = await c.query(`
    SELECT COUNT(*)::bigint AS n
    FROM "Announcement"
    WHERE regexp_replace(lower("orgName"), '\\s+', '', 'g') LIKE '%' || regexp_replace(lower('한국토지주택공사'), '\\s+', '', 'g') || '%'
  `);
  console.log(`\nnospace LIKE 전체: ${Number(test.rows[0].n).toLocaleString()}건 (${Date.now() - t0}ms)`);

  c.release(); await pool.end();
})();

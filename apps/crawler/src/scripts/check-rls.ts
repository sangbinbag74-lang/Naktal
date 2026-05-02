/**
 * RLS 활성화 여부 전수 점검
 * Supabase 경고 확인용
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
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    // RLS 비활성 테이블 (public 스키마)
    const r = await c.query(`
      SELECT
        schemaname,
        tablename,
        rowsecurity AS rls_on,
        (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename)::int AS policy_count
      FROM pg_tables t
      WHERE schemaname = 'public'
      ORDER BY rowsecurity ASC, tablename
    `);

    console.log(`=== RLS 점검 (public 스키마) ===\n`);
    const rlsOff: string[] = [];
    const rlsOn: string[] = [];
    for (const row of r.rows) {
      const line = `  ${row.rls_on ? "✅" : "❌"} ${row.tablename.padEnd(30)} RLS=${row.rls_on ? "ON " : "OFF"}  policies=${row.policy_count}`;
      if (row.rls_on) rlsOn.push(line);
      else rlsOff.push(line);
    }

    console.log(`[RLS 비활성 — 위험]`);
    if (rlsOff.length === 0) console.log(`  없음 ✅`);
    else rlsOff.forEach(l => console.log(l));

    console.log(`\n[RLS 활성]`);
    if (rlsOn.length === 0) console.log(`  없음`);
    else rlsOn.forEach(l => console.log(l));

    console.log(`\n합계: RLS ON ${rlsOn.length}개 / RLS OFF ${rlsOff.length}개`);
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);

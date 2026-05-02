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
    // 현재 연결 role + BYPASSRLS 여부 확인
    const r = await c.query(`
      SELECT current_user AS role,
             rolsuper AS is_superuser,
             rolbypassrls AS bypass_rls
      FROM pg_roles
      WHERE rolname = current_user
    `);
    const x = r.rows[0];
    console.log(`=== DB 연결 권한 ===`);
    console.log(`  role         : ${x.role}`);
    console.log(`  superuser    : ${x.is_superuser}`);
    console.log(`  BYPASSRLS    : ${x.bypass_rls}`);
    if (x.bypass_rls || x.is_superuser) {
      console.log(`\n✅ 크롤러 RLS 우회 가능 — RLS 활성화해도 영향 없음`);
    } else {
      console.log(`\n⚠️ 크롤러가 RLS 적용 대상 — 정책 없으면 INSERT/UPDATE 차단됨`);
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);

/**
 * 인덱스 상태 확인 — INVALID (실패한 CONCURRENTLY) 검출
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    let direct: string | undefined;
    let pooled: string | undefined;
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eqIdx = t.indexOf("=");
      if (eqIdx === -1) continue;
      const k = t.slice(0, eqIdx).trim();
      const v = t.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DIRECT_URL" && v && !v.includes("[YOUR-PASSWORD]")) direct = v;
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) pooled = v;
    }
    return direct ?? pooled;
  } catch {}
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 1 });
  const c = await pool.connect();

  try {
    const { rows: idxs } = await c.query<{
      indexname: string; indisvalid: boolean; indisready: boolean; size: string;
    }>(`
      SELECT
        i.relname AS indexname,
        ix.indisvalid,
        ix.indisready,
        pg_size_pretty(pg_relation_size(i.oid)) AS size
      FROM pg_class i
      JOIN pg_index ix ON ix.indexrelid = i.oid
      JOIN pg_class t ON t.oid = ix.indrelid
      WHERE t.relname = 'Announcement'
      ORDER BY pg_relation_size(i.oid) DESC
    `);

    console.log("Announcement 인덱스 상태:");
    console.log("─".repeat(76));
    for (const r of idxs) {
      const status = r.indisvalid ? "VALID" : "INVALID";
      const ready = r.indisready ? "READY" : "NOT READY";
      const flag = r.indisvalid && r.indisready ? "✓" : "⚠";
      console.log(`  ${flag} ${r.indexname.padEnd(40)} ${r.size.padEnd(10)} ${status} / ${ready}`);
    }

    const invalid = idxs.filter(r => !r.indisvalid || !r.indisready);
    if (invalid.length > 0) {
      console.log(`\n⚠ INVALID/NOT READY 인덱스 ${invalid.length}개 — DROP 후 재생성 필요`);
      for (const r of invalid) {
        console.log(`  DROP INDEX CONCURRENTLY "${r.indexname}";`);
      }
    } else {
      console.log("\n✓ 모든 인덱스 정상");
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

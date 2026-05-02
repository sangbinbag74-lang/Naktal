/**
 * PreStdrd rawJson → bfSpecRgstNm/ntceInsttNm reparse
 * 실제 API 응답 필드: prdctClsfcNoNm (사전규격명), orderInsttNm (발주기관명)
 * 기존 코드가 bfSpecRgstNm/ntceInsttNm 매핑 → 둘 다 0% 결측
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDbUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  return process.env.DATABASE_URL!;
}

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 0 });
  const c = await pool.connect();
  try {
    process.stdout.write("PreStdrd rawJson → bfSpecRgstNm/ntceInsttNm reparse\n");
    const t0 = Date.now();
    const res = await c.query(`
      UPDATE "PreStdrd"
      SET
        "bfSpecRgstNm" = COALESCE(NULLIF("rawJson"->>'prdctClsfcNoNm', ''), "bfSpecRgstNm"),
        "ntceInsttNm"  = COALESCE(NULLIF("rawJson"->>'orderInsttNm', ''),   "ntceInsttNm")
      WHERE "rawJson" IS NOT NULL
        AND (COALESCE("bfSpecRgstNm",'') = '' OR COALESCE("ntceInsttNm",'') = '')
    `);
    process.stdout.write(`UPDATED ${res.rowCount} in ${((Date.now()-t0)/1000).toFixed(1)}s\n`);

    const v = await c.query(`
      SELECT COUNT(*) FILTER (WHERE COALESCE("bfSpecRgstNm",'') != '')::bigint AS nm,
             COUNT(*) FILTER (WHERE COALESCE("ntceInsttNm",'')  != '')::bigint AS inst,
             COUNT(*)::bigint AS total
      FROM "PreStdrd"
    `);
    process.stdout.write(`검증: ${JSON.stringify(v.rows[0])}\n`);
  } finally {
    c.release();
    await pool.end();
  }
})();

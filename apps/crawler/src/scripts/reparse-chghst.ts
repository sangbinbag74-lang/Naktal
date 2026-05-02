/**
 * AnnouncementChgHst rawJson → chgItemNm/bfChgVal/afChgVal 컬럼 채우기
 * API 호출 없음. 487K 행 UPDATE.
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
  const client = await pool.connect();
  try {
    process.stdout.write("reparse AnnouncementChgHst rawJson → chgItemNm/bfChgVal/afChgVal\n");
    const t0 = Date.now();
    const res = await client.query(`
      UPDATE "AnnouncementChgHst"
      SET
        "chgItemNm" = COALESCE("rawJson"->>'chgItemNm', ''),
        "bfChgVal"  = COALESCE("rawJson"->>'bfchgVal', ''),
        "afChgVal"  = COALESCE("rawJson"->>'afchgVal', '')
      WHERE "rawJson" IS NOT NULL
        AND ("chgItemNm" = '' OR "bfChgVal" = '' OR "afChgVal" = '')
    `);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`[OK] ${res.rowCount} rows UPDATED in ${sec}s\n`);

    // 검증
    const v = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE "chgItemNm" != '')::bigint AS item_filled,
        COUNT(*) FILTER (WHERE "bfChgVal"  != '')::bigint AS bf_filled,
        COUNT(*) FILTER (WHERE "afChgVal"  != '')::bigint AS af_filled,
        COUNT(*)::bigint AS total
      FROM "AnnouncementChgHst"
    `);
    process.stdout.write(`검증: ${JSON.stringify(v.rows[0])}\n`);
    const sample = await client.query(`SELECT "annId","chgItemNm","bfChgVal","afChgVal" FROM "AnnouncementChgHst" WHERE "chgItemNm" != '' LIMIT 5`);
    process.stdout.write(`샘플:\n${JSON.stringify(sample.rows, null, 2)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
})();

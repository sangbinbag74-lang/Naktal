/**
 * Announcement rawJson → 결측 컬럼 reparse
 *   ciblAplYn / mtltyAdvcPsblYn / jntcontrctDutyRgnNm1/2/3 / RgnDutyJntcontrctRt/Yn / cnstrtsiteRgnNm / bidQlfctRgstDt
 * (prtcptPsblRgnNm, jntcontrctDutyRgnNm 단수 — 2026-04-30 DROP COLUMN, 제거됨)
 * API 재호출 없음. 단일 UPDATE.
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
    process.stdout.write("Announcement rawJson → 9개 필드 reparse (ciblAplYn/mtltyAdvcPsblYn + jntcontrctDutyRgnNm1/2/3 + RgnDutyJntcontrctRt/Yn + cnstrtsiteRgnNm + bidQlfctRgstDt)\n");
    const t0 = Date.now();
    const res = await c.query(`
      UPDATE "Announcement"
      SET
        "ciblAplYn"            = COALESCE(NULLIF("rawJson"->>'ciblAplYn', ''),            "ciblAplYn"),
        "mtltyAdvcPsblYn"      = COALESCE(NULLIF("rawJson"->>'mtltyAdvcPsblYn', ''),      "mtltyAdvcPsblYn"),
        "jntcontrctDutyRgnNm1" = COALESCE(NULLIF("rawJson"->>'jntcontrctDutyRgnNm1', ''), "jntcontrctDutyRgnNm1"),
        "jntcontrctDutyRgnNm2" = COALESCE(NULLIF("rawJson"->>'jntcontrctDutyRgnNm2', ''), "jntcontrctDutyRgnNm2"),
        "jntcontrctDutyRgnNm3" = COALESCE(NULLIF("rawJson"->>'jntcontrctDutyRgnNm3', ''), "jntcontrctDutyRgnNm3"),
        "rgnDutyJntcontrctRt"  = COALESCE(NULLIF("rawJson"->>'rgnDutyJntcontrctRt', ''),  "rgnDutyJntcontrctRt"),
        "rgnDutyJntcontrctYn"  = COALESCE(NULLIF("rawJson"->>'rgnDutyJntcontrctYn', ''),  "rgnDutyJntcontrctYn"),
        "cnstrtsiteRgnNm"      = COALESCE(NULLIF("rawJson"->>'cnstrtsiteRgnNm', ''),      "cnstrtsiteRgnNm"),
        "bidQlfctRgstDt"       = COALESCE(
          CASE WHEN "rawJson"->>'bidQlfctRgstDt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
               THEN ("rawJson"->>'bidQlfctRgstDt' || '+09:00')::timestamptz
               ELSE NULL END,
          "bidQlfctRgstDt"
        )
      WHERE "rawJson" IS NOT NULL
    `);
    process.stdout.write(`UPDATED ${res.rowCount} rows in ${((Date.now()-t0)/1000).toFixed(1)}s\n`);

    const v = await c.query(`
      SELECT
        COUNT(*) FILTER (WHERE "ciblAplYn"          != '')::bigint AS cibl,
        COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn"    != '')::bigint AS mtlty,
        COUNT(*)::bigint AS total
      FROM "Announcement"
    `);
    process.stdout.write(`검증: ${JSON.stringify(v.rows[0])}\n`);
  } finally {
    c.release();
    await pool.end();
  }
})();

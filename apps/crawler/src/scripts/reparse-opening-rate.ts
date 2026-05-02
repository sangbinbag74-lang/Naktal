/**
 * BidOpeningDetail rawJson → sucsfbidRate reparse
 * opengCorpInfo 형식: "기업명^번호^대표자^번호^90.179"
 * 마지막 '^' 뒤 숫자 = 낙찰률(%)
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
    process.stdout.write("BidOpeningDetail rawJson → sucsfbidRate reparse (opengCorpInfo 파싱)\n");
    const t0 = Date.now();
    // rawJson 이 배열일 수도 있고 object일 수도. jsonb_path_query로 opengCorpInfo 추출
    const res = await c.query(`
      UPDATE "BidOpeningDetail" bod
      SET "sucsfbidRate" = sub.rate
      FROM (
        SELECT
          b."annId",
          (regexp_match(
            CASE
              WHEN jsonb_typeof(b."rawJson") = 'array' THEN b."rawJson"->0->>'opengCorpInfo'
              ELSE b."rawJson"->>'opengCorpInfo'
            END,
            '\\^([0-9]+\\.[0-9]+)\\s*$'
          ))[1]::float8 AS rate
        FROM "BidOpeningDetail" b
        WHERE b."sucsfbidRate" IS NULL AND b."rawJson" IS NOT NULL
      ) sub
      WHERE bod."annId" = sub."annId" AND sub.rate IS NOT NULL AND sub.rate > 0
    `);
    process.stdout.write(`UPDATED ${res.rowCount} rows in ${((Date.now()-t0)/1000).toFixed(1)}s\n`);

    const v = await c.query(`
      SELECT
        COUNT(*) FILTER (WHERE "sucsfbidRate" IS NOT NULL AND "sucsfbidRate" > 0)::bigint AS filled,
        COUNT(*)::bigint AS total
      FROM "BidOpeningDetail"
    `);
    process.stdout.write(`검증: ${JSON.stringify(v.rows[0])}\n`);
  } finally {
    c.release();
    await pool.end();
  }
})();

// BPP 에 남아있는 모든 row (만료 무관) 를 AIPrediction 으로 복사
// 영구 저장 정책 확정 후 1회성 백필
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, "../../../../.env.local"));
loadEnv(path.resolve(__dirname, "../../../../.env"));
loadEnv(path.resolve(__dirname, "../../../web/.env.local"));
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL 없음");

(async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    // 진단: AIPrediction 대비 BPP 매칭 가능한 row 수
    const diag = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM "AIPrediction")::int AS aip_total,
        (SELECT COUNT(*) FROM "BidPricePrediction")::int AS bpp_total,
        (SELECT COUNT(*) FROM "AIPrediction" a JOIN "BidPricePrediction" b ON a."annId" = b."annId")::int AS overlap,
        (SELECT COUNT(*) FROM "AIPrediction" WHERE "sampleSize" > 0)::int AS aip_with_sample
    `);
    console.log("진단:", diag.rows[0]);

    // 백필 (overlap 전부)
    const r = await pool.query(`
      UPDATE "AIPrediction" a
      SET
        "bidPriceRangeLow"  = COALESCE(a."bidPriceRangeLow",  b."bidPriceRangeLow"),
        "bidPriceRangeHigh" = COALESCE(a."bidPriceRangeHigh", b."bidPriceRangeHigh"),
        "sampleSize"        = GREATEST(a."sampleSize", COALESCE(b."sampleSize", 0))
      FROM "BidPricePrediction" b
      WHERE a."annId" = b."annId"
    `);
    console.log(`백필: ${r.rowCount}건`);

    // 결과 확인
    const c = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "sampleSize" > 0)::int AS with_sample,
        COUNT(*) FILTER (WHERE "bidPriceRangeLow" IS NOT NULL)::int AS with_range,
        COUNT(*) FILTER (WHERE "optimalBidPrice" > 0)::int AS with_optimal
      FROM "AIPrediction"
    `);
    console.log("최종 채움률:", c.rows[0]);
  } finally {
    await pool.end();
  }
})();

// AIPrediction 에 BidPricePrediction 캐시 만료 후에도 화면 표시되도록
// optimalBidPrice 외 부수 필드 영구 저장 컬럼 추가 + 기존 row BPP→AIP 백필
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

// .env.local 직접 파싱 (dotenv 미설치 환경 대응)
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
// 우선순위: 루트 .env.local (정상 값) > .env > apps/web/.env.local (placeholder 있을 수 있음)
loadEnv(path.resolve(__dirname, "../../../../.env.local"));
loadEnv(path.resolve(__dirname, "../../../../.env"));
loadEnv(path.resolve(__dirname, "../../../web/.env.local"));
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL 없음");

(async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    console.log("[1/3] ALTER TABLE AIPrediction — 3 columns 추가");
    await pool.query(`
      ALTER TABLE "AIPrediction"
        ADD COLUMN IF NOT EXISTS "bidPriceRangeLow"  bigint,
        ADD COLUMN IF NOT EXISTS "bidPriceRangeHigh" bigint,
        ADD COLUMN IF NOT EXISTS "sampleSize"        integer NOT NULL DEFAULT 0
    `);
    console.log("  OK");

    console.log("[2/3] BPP→AIP 백필 (캐시 만료/잔존 무관 모두 채움)");
    const r = await pool.query(`
      UPDATE "AIPrediction" a
      SET
        "bidPriceRangeLow"  = b."bidPriceRangeLow",
        "bidPriceRangeHigh" = b."bidPriceRangeHigh",
        "sampleSize"        = COALESCE(b."sampleSize", 0)
      FROM "BidPricePrediction" b
      WHERE a."annId" = b."annId"
        AND (a."sampleSize" = 0 OR a."bidPriceRangeLow" IS NULL)
    `);
    console.log(`  ${r.rowCount}건 백필 완료`);

    console.log("[3/3] 채움률 확인");
    const c = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "sampleSize" > 0) AS with_sample,
        COUNT(*) FILTER (WHERE "bidPriceRangeLow" IS NOT NULL) AS with_range
      FROM "AIPrediction"
    `);
    console.log(c.rows[0]);
  } finally {
    await pool.end();
  }
})();

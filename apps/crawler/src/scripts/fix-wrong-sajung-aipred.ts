/**
 * AIPrediction.actualSajungRate 가 비정상 (105% 초과 또는 95% 미만) 인 row 를
 * Announcement.bsisAmt 기준으로 재계산해서 정정.
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    const rows = await p.query(`
      SELECT
        ap."annId", ap."konepsId", ap."title",
        ap."actualSajungRate"::numeric AS wrong_actual,
        ap."actualFinalPrice"::numeric AS fp,
        ap."predictedSajungRate"::numeric AS pred,
        br."bidRate"::numeric AS rate,
        a."bsisAmt"::numeric AS bsis,
        a."aValueAmt"::numeric AS av,
        a.budget::numeric AS bud
      FROM "AIPrediction" ap
      LEFT JOIN "Announcement" a ON a."konepsId" = ap."konepsId"
      LEFT JOIN "BidResult" br ON br."annId" = ap."konepsId"
      WHERE ap."actualSajungRate" IS NOT NULL
        AND (ap."actualSajungRate" > 105 OR ap."actualSajungRate" < 95)
    `);
    console.log(`비정상 사정율 ${rows.rows.length}건`);
    let fixed = 0, skipped = 0;
    for (const r of rows.rows) {
      const bsis = Number(r.bsis); const av = Number(r.av); const bud = Number(r.bud);
      const base = bsis > 0 ? bsis : av > 0 ? av : Math.round(bud * 1.1);
      const fp = Number(r.fp); const rate = Number(r.rate);
      if (base <= 0 || fp <= 0 || rate <= 0) { skipped++; continue; }
      const newSajung = (fp / (rate / 100) / base) * 100;
      const pred = Number(r.pred);
      const dev = pred > 0 ? Math.abs(pred - newSajung) : null;
      const isExact = dev != null && dev <= 0.2;
      const isHit = dev != null && dev <= 0.5;
      const isNearHit = dev != null && dev <= 1.0;
      await p.query(
        `UPDATE "AIPrediction" SET "actualSajungRate" = $1, "deviationPct" = $2,
          "isExact" = $3, "isHit" = $4, "isNearHit" = $5
         WHERE "annId" = $6`,
        [newSajung.toFixed(4), dev?.toFixed(4) ?? null, isExact, isHit, isNearHit, r.annId]
      );
      console.log(`  ✓ ${r.konepsId} ${r.title?.slice(0,30)} : ${Number(r.wrong_actual).toFixed(2)}% → ${newSajung.toFixed(2)}% (dev ${dev?.toFixed(3)}%p)`);
      fixed++;
    }
    console.log(`\n결과: 수정 ${fixed} / 스킵 ${skipped}`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

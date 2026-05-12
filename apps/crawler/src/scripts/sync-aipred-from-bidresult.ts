/**
 * BidResult 새로 들어온 row 들에 대해 AIPrediction.actualSajungRate 일괄 갱신
 * (정상 base = bsisAmt 사용)
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // AIPrediction (resultFilledAt NULL) + BidResult 존재하는 row
    const rows = await p.query(`
      SELECT
        ap."annId", ap."konepsId", ap."predictedSajungRate"::numeric AS pred,
        a."bsisAmt"::numeric AS bsis, a."aValueAmt"::numeric AS av, a.budget::numeric AS bud,
        br."finalPrice"::numeric AS fp, br."bidRate"::numeric AS rate
      FROM "AIPrediction" ap
      JOIN "Announcement" a ON a."konepsId" = ap."konepsId"
      JOIN "BidResult" br ON br."annId" = ap."konepsId"
      WHERE ap."resultFilledAt" IS NULL
    `);
    console.log(`AIPrediction 갱신 대상 ${rows.rows.length}건`);

    let fixed = 0;
    for (const r of rows.rows) {
      const bsis = Number(r.bsis); const av = Number(r.av); const bud = Number(r.bud);
      const base = bsis > 0 ? bsis : av > 0 ? av : Math.round(bud * 1.1);
      const fp = Number(r.fp); const rate = Number(r.rate); const pred = Number(r.pred);
      if (base <= 0 || fp <= 0 || rate <= 0) continue;
      const actual = (fp / (rate / 100) / base) * 100;
      const dev = pred > 0 ? Math.abs(pred - actual) : null;
      await p.query(
        `UPDATE "AIPrediction" SET
           "actualSajungRate" = $1, "actualFinalPrice" = $2,
           "deviationPct" = $3, "isExact" = $4, "isHit" = $5, "isNearHit" = $6,
           "resultFilledAt" = NOW()
         WHERE "annId" = $7`,
        [actual.toFixed(4), String(Math.round(fp)),
         dev?.toFixed(4) ?? null,
         dev != null && dev <= 0.2,
         dev != null && dev <= 0.5,
         dev != null && dev <= 1.0,
         r.annId]
      );
      fixed++;
    }
    console.log(`결과: ${fixed}건 AIPrediction 채움`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

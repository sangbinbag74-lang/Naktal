/**
 * BidRequest 일관성 정정
 * - 저장 사정율(predictedSajungRate)은 95~105 정상인데
 * - 추천금액·예가·하한가가 그 사정율과 일치하지 않는 row 자동 정정
 * - 정상 공식으로 재계산 후 UPDATE
 *
 * 정상 공식:
 *   estimatedPrice = budget × sajungRate / 100
 *   lowerLimit = ceil((estimatedPrice - aValueTotal) × lwlt / 100 + aValueTotal)
 *   recommendedBidPrice = lowerLimit (안전 마진 폐기 후)
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const DRY_RUN = process.env.DRY_RUN === "1";

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 전체 BidRequest 스캔, 저장 사정율과 역산 사정율의 차이가 1%p 이상 → 비정상
    const rows = await p.query(`
      SELECT br.id, br."konepsId", br.title, br."orgName",
             br."recommendedBidPrice"::numeric AS price,
             br.budget::numeric AS budget,
             br."estimatedPrice"::numeric AS est_price,
             br."lowerLimitPrice"::numeric AS lower_limit,
             br."lowerLimitRate"::numeric AS lwlt,
             br."aValueTotal"::numeric AS av,
             br."predictedSajungRate"::numeric AS saved_sajung,
             br."contractAt"
      FROM "BidRequest" br
      WHERE br."predictedSajungRate" IS NOT NULL
        AND br."predictedSajungRate" BETWEEN 90 AND 110
        AND br.budget::numeric > 0
        AND br."recommendedBidPrice"::numeric > 0
        AND br."lowerLimitRate"::numeric > 0
    `);

    let fixed = 0;
    let okSkipped = 0;
    let outOfRangeSkipped = 0;
    const fixes: Array<{ id: string; konepsId: string; before: number; after: number }> = [];

    for (const r of rows.rows) {
      const price = Number(r.price); const budget = Number(r.budget);
      const lwlt = Number(r.lwlt); const av = Number(r.av);
      const savedSajung = Number(r.saved_sajung);

      // 저장 사정율로 정상 추천금액 재계산
      const expectedEstPrice = budget * savedSajung / 100;
      const expectedLowerLimit = Math.ceil((expectedEstPrice - av) * lwlt / 100 + av);

      // 차이 1만원 이내면 정상
      if (Math.abs(price - expectedLowerLimit) < 10_000) {
        okSkipped++;
        continue;
      }

      // 차이가 1만원 이상 → 비정상. 정상값으로 정정
      // 단, 정정 후 verifyEff 도 90~110 범위인지 확인
      const newPrice = expectedLowerLimit;
      const newEstPrice = Math.round(expectedEstPrice);
      const verifyEff = (((newPrice - av) * 100 / lwlt) + av) * 100 / budget;
      if (verifyEff < 90 || verifyEff > 110) {
        console.log(`  ⚠ ${r.konepsId}: 정정 후도 비정상 (${verifyEff.toFixed(3)}%) — skip`);
        outOfRangeSkipped++;
        continue;
      }

      fixes.push({ id: r.id, konepsId: r.konepsId, before: price, after: newPrice });
      console.log(`  ${r.konepsId} (${r.title?.slice(0, 30)}) [${r.orgName?.slice(0, 20)}]`);
      console.log(`    저장 사정율: ${savedSajung.toFixed(3)}%`);
      console.log(`    추천금액: ${price.toLocaleString()} → ${newPrice.toLocaleString()} (차이 ${(newPrice - price).toLocaleString()})`);
      console.log(`    예가: ${Number(r.est_price).toLocaleString()} → ${newEstPrice.toLocaleString()}`);
      console.log(`    낙찰하한가: ${Number(r.lower_limit).toLocaleString()} → ${newPrice.toLocaleString()}`);

      if (!DRY_RUN) {
        await p.query(`
          UPDATE "BidRequest"
          SET "recommendedBidPrice" = $1,
              "estimatedPrice" = $2,
              "lowerLimitPrice" = $3,
              "agreedFeeAmount" = $4,
              "agreedFeeRate" = $5,
              "updatedAt" = NOW()
          WHERE id = $6
        `, [
          String(newPrice),
          String(newEstPrice),
          String(newPrice),
          String(Math.round(newPrice * (newPrice < 100_000_000 ? 0.017 : 0.015))),
          newPrice < 100_000_000 ? 0.017 : 0.015,
          r.id,
        ]);
      }
      fixed++;
    }

    console.log(`\n=== 결과 ===`);
    console.log(`  ${DRY_RUN ? "DRY RUN" : "적용"}: ${fixed}건`);
    console.log(`  정상 (skip): ${okSkipped}건`);
    console.log(`  정정 후도 비정상 (skip): ${outOfRangeSkipped}건`);
    console.log(`  전체 검사: ${rows.rows.length}건`);

    if (DRY_RUN && fixes.length > 0) {
      console.log(`\n실제 적용하려면 DRY_RUN 환경변수 제거 후 재실행.`);
    }
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

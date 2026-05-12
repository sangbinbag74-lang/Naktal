/**
 * BidRequest.budget 비정상 정정 + 표시 정합성 보장
 * 옛 코드 시점에 저장된 잘못된 budget 을 Announcement.bsisAmt 기준으로 정정
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 역산 사정율이 95~105 범위 밖인 BidRequest 추출
    const rows = await p.query(`
      SELECT br.id, br."konepsId", br.title,
             br."recommendedBidPrice"::numeric AS price,
             br.budget::numeric AS budget,
             br."lowerLimitRate"::numeric AS lwlt,
             br."aValueTotal"::numeric AS av,
             a."bsisAmt"::numeric AS bsis,
             a."aValueAmt"::numeric AS ann_av,
             a.budget::numeric AS ann_budget
      FROM "BidRequest" br
      LEFT JOIN "Announcement" a ON a."konepsId" = br."konepsId"
      WHERE br."recommendedBidPrice"::numeric > 0
        AND br.budget::numeric > 0
        AND br."lowerLimitRate"::numeric > 0
    `);

    let fixed = 0, skipped = 0;
    for (const r of rows.rows) {
      const price = Number(r.price); const budget = Number(r.budget);
      const lwlt = Number(r.lwlt); const av = Number(r.av);
      const eff = (((price - av) * 100 / lwlt) + av) * 100 / budget;
      if (eff >= 95 && eff <= 105) continue; // 정상이면 skip

      // 정상 base 계산 (bsisAmt > aValueAmt > budget × 1.1)
      const bsis = Number(r.bsis); const annAv = Number(r.ann_av); const annBud = Number(r.ann_budget);
      const newBase = bsis > 0 ? bsis : annAv > 0 ? annAv : Math.round(annBud * 1.1);
      if (newBase <= 0) { skipped++; continue; }

      // 새 base 로 역산 검증
      const newEff = (((price - av) * 100 / lwlt) + av) * 100 / newBase;
      if (newEff < 95 || newEff > 105) {
        console.log(`  ⚠ ${r.konepsId}: 새 base(${newBase}) 적용해도 비정상 (eff=${newEff.toFixed(3)}%). 추천가 자체 결함 — skip.`);
        skipped++;
        continue;
      }

      await p.query(`UPDATE "BidRequest" SET budget = $1 WHERE id = $2`, [String(newBase), r.id]);
      console.log(`  ✓ ${r.konepsId}: budget ${budget.toLocaleString()} → ${newBase.toLocaleString()} (eff ${eff.toFixed(3)}% → ${newEff.toFixed(3)}%)`);
      fixed++;
    }
    console.log(`\n결과: 정정 ${fixed} / 스킵 ${skipped} / 검사 ${rows.rows.length}`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

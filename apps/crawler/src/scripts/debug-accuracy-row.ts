/**
 * /admin/accuracy 의 107.515% 이상값 케이스 (부천고용센터 승강기) 실측 디버그
 * 박상빈님 5/18 명시: bsisAmt 누락이 진짜 원인인지 조사
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(key: "DIRECT_URL"): string {
  const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    if (l.startsWith(`${key}=`)) {
      return l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${key} 없음`);
}

(async () => {
  const pool = new Pool({ connectionString: loadEnv("DIRECT_URL"), max: 1 });
  try {
    // 1. 부천고용센터 승강기 공고 검색
    const annQ = await pool.query(`
      SELECT id, "konepsId", title, "orgName", budget, "bsisAmt", "aValueAmt", "aValueTotal",
             "sucsfbidLwltRate", "rsrvtnPrceRngBgnRate", "rsrvtnPrceRngEndRate",
             "priceRangeRate", deadline, category
      FROM "Announcement"
      WHERE title ILIKE '%부천%' AND title ILIKE '%승강기%'
      ORDER BY deadline DESC
      LIMIT 5
    `);
    console.log(`\n=== Announcement (부천 승강기) ${annQ.rowCount}건 ===`);
    for (const a of annQ.rows) {
      console.log(JSON.stringify({
        id: a.id, konepsId: a.konepsId, title: a.title,
        budget: Number(a.budget),
        bsisAmt: Number(a.bsisAmt),
        aValueAmt: Number(a.aValueAmt),
        aValueTotal: Number(a.aValueTotal),
        sucsfbidLwltRate: Number(a.sucsfbidLwltRate),
        rsrvtnPrceRngBgnRate: a.rsrvtnPrceRngBgnRate,
        rsrvtnPrceRngEndRate: a.rsrvtnPrceRngEndRate,
        priceRangeRate: a.priceRangeRate,
        category: a.category,
      }, null, 2));
    }

    if (annQ.rowCount === 0) {
      console.log("부천 승강기 공고 없음. title 키워드 확장 조회...");
      const annQ2 = await pool.query(`
        SELECT id, "konepsId", title, budget, "bsisAmt"
        FROM "Announcement"
        WHERE title ILIKE '%승강기%침대%' OR title ILIKE '%고용센터%승강기%'
        LIMIT 10
      `);
      for (const a of annQ2.rows) console.log(a);
      return;
    }

    const annIds = annQ.rows.map(r => r.id);
    const konepsIds = annQ.rows.map(r => r.konepsId);

    // 2. BidResult 조회
    const brQ = await pool.query(`
      SELECT "annId", "winnerName", "finalPrice", "numBidders", "bidRate", "openedAt"
      FROM "BidResult"
      WHERE "annId" = ANY($1)
    `, [konepsIds]);
    console.log(`\n=== BidResult ${brQ.rowCount}건 ===`);
    for (const b of brQ.rows) console.log(JSON.stringify({
      annId: b.annId, winnerName: b.winnerName,
      finalPrice: Number(b.finalPrice), numBidders: b.numBidders,
      bidRate: Number(b.bidRate), openedAt: b.openedAt,
    }, null, 2));

    // 3. BidPricePrediction 조회 (AI 예측값)
    const bppQ = await pool.query(`
      SELECT "annId", "predictedSajungRate", "optimalBidPrice", "sampleSize",
             "actualSajungRate", "actualFinalPrice", "deviationPct", "isHit", "modelVersion"
      FROM "BidPricePrediction"
      WHERE "annId" = ANY($1)
    `, [annIds]);
    console.log(`\n=== BidPricePrediction ${bppQ.rowCount}건 ===`);
    for (const p of bppQ.rows) console.log(JSON.stringify({
      annId: p.annId,
      predictedSajungRate: p.predictedSajungRate ? Number(p.predictedSajungRate) : null,
      optimalBidPrice: p.optimalBidPrice ? Number(p.optimalBidPrice) : null,
      sampleSize: p.sampleSize,
      actualSajungRate: p.actualSajungRate ? Number(p.actualSajungRate) : null,
      actualFinalPrice: p.actualFinalPrice ? Number(p.actualFinalPrice) : null,
      deviationPct: p.deviationPct ? Number(p.deviationPct) : null,
      isHit: p.isHit,
      modelVersion: p.modelVersion,
    }, null, 2));

    // 4. accuracy 페이지 사정율 재계산 (실측)
    console.log(`\n=== /admin/accuracy 사정율 재계산 (실측) ===`);
    for (const a of annQ.rows) {
      const br = brQ.rows.find(r => r.annId === a.konepsId);
      if (!br) { console.log(`konepsId=${a.konepsId}: BidResult 없음`); continue; }

      const bsis = Number(a.bsisAmt ?? 0);
      const avAmt = Number(a.aValueAmt ?? 0);
      const bud = Number(a.budget ?? 0);
      const base = bsis > 0 ? bsis : avAmt > 0 ? avAmt : Math.round(bud * 1.1);
      const baseSource = bsis > 0 ? "bsisAmt" : avAmt > 0 ? "aValueAmt" : "budget*1.1";

      const finalPrice = Number(br.finalPrice);
      const bidRate = Number(br.bidRate);
      const expectedPrice = bidRate > 0 ? finalPrice / (bidRate / 100) : 0;
      const sajungRate = base > 0 ? (expectedPrice / base) * 100 : 0;

      console.log(`\n[${a.title}]`);
      console.log(`  budget=${bud.toLocaleString()} bsisAmt=${bsis.toLocaleString()} aValueAmt=${avAmt.toLocaleString()}`);
      console.log(`  base=${base.toLocaleString()} (source=${baseSource})`);
      console.log(`  finalPrice=${finalPrice.toLocaleString()} bidRate=${bidRate}%`);
      console.log(`  expectedPrice = ${finalPrice.toLocaleString()} / ${(bidRate/100).toFixed(4)} = ${Math.round(expectedPrice).toLocaleString()}`);
      console.log(`  sajungRate = ${Math.round(expectedPrice).toLocaleString()} / ${base.toLocaleString()} × 100 = ${sajungRate.toFixed(4)}%`);
      console.log(`  유효범위(97~103%) 초과?: ${sajungRate < 97 || sajungRate > 103 ? 'YES' : 'NO'}`);

      // budget vs bsisAmt 비교 (보통 bsisAmt ≈ budget × 1.1)
      if (bsis > 0 && bud > 0) {
        console.log(`  bsisAmt / budget = ${(bsis / bud).toFixed(4)} (정상 ≈ 1.1)`);
      }
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });

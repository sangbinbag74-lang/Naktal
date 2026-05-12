/**
 * AIPrediction 결과 미수집 18건의 진짜 원인 진단
 * 추측 없이 실측만.
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 1. AIPrediction 전체 카운트 + 결과 채움 분포
    const a = await p.query(`
      SELECT
        COUNT(*) AS total,
        COUNT("resultFilledAt") AS filled,
        COUNT(*) - COUNT("resultFilledAt") AS pending,
        SUM(CASE WHEN "deadline" < NOW() THEN 1 ELSE 0 END) AS deadline_passed,
        SUM(CASE WHEN "deadline" < NOW() AND "resultFilledAt" IS NULL THEN 1 ELSE 0 END) AS pending_after_deadline,
        SUM(CASE WHEN "konepsId" IS NULL OR "konepsId" = '' THEN 1 ELSE 0 END) AS no_koneps
      FROM "AIPrediction"
    `);
    console.log("=== AIPrediction 카운트 ===");
    console.log(a.rows[0]);

    // 2. AIPrediction 미입력 18건 샘플 (deadline, konepsId, BidResult 매칭 여부)
    const b = await p.query(`
      SELECT
        ap."annId", ap."konepsId", ap."title", ap."deadline",
        ap."predictedSajungRate", ap."budget",
        br."finalPrice", br."bidRate", br."winnerName",
        CASE WHEN br."annId" IS NULL THEN 'NO_BidResult'
             WHEN br."finalPrice" IS NULL OR br."finalPrice"::numeric = 0 THEN 'NO_finalPrice'
             WHEN br."bidRate" IS NULL OR br."bidRate"::numeric = 0 THEN 'NO_bidRate'
             ELSE 'OK' END AS reason
      FROM "AIPrediction" ap
      LEFT JOIN "BidResult" br ON br."annId" = ap."konepsId"
      WHERE ap."resultFilledAt" IS NULL
      ORDER BY ap."deadline" ASC
      LIMIT 30
    `);
    console.log("\n=== AIPrediction 미입력 18건 (deadline 오름차순) ===");
    for (const r of b.rows) {
      const dPassed = new Date(r.deadline) < new Date() ? "마감지남" : "마감전";
      console.log(`  [${dPassed}] ${r.deadline?.toISOString?.()?.slice(0,16) ?? r.deadline} koneps=${r.konepsId} reason=${r.reason} title=${(r.title ?? "").slice(0, 40)}`);
    }

    // 3. AIPrediction.konepsId 일부로 BidResult 매칭 시도 (다른 형식 가능성)
    const c = await p.query(`
      SELECT ap."konepsId" AS ap_koneps, br."annId" AS br_ann
      FROM "AIPrediction" ap
      LEFT JOIN "BidResult" br ON TRIM(br."annId") = TRIM(ap."konepsId")
      WHERE ap."resultFilledAt" IS NULL
      LIMIT 5
    `);
    console.log("\n=== TRIM 매칭 (혹시 공백 차이?) ===");
    for (const r of c.rows) console.log(`  ap=[${r.ap_koneps}] br=[${r.br_ann ?? 'NULL'}]`);

    // 4. BidResult 최근 30일 카운트
    const d = await p.query(`
      SELECT COUNT(*) AS recent, MAX("createdAt") AS latest
      FROM "BidResult"
      WHERE "createdAt" > NOW() - INTERVAL '30 days'
    `);
    console.log("\n=== BidResult 최근 30일 ===");
    console.log(d.rows[0]);

    // 5. AIPrediction 18건의 konepsId 가 BidResult 에 진짜로 없는지 직접 확인
    const e = await p.query(`
      SELECT ap."konepsId", EXISTS(SELECT 1 FROM "BidResult" br WHERE br."annId" = ap."konepsId") AS in_bidresult
      FROM "AIPrediction" ap
      WHERE ap."resultFilledAt" IS NULL
    `);
    let inBR = 0, notInBR = 0;
    for (const r of e.rows) { if (r.in_bidresult) inBR++; else notInBR++; }
    console.log(`\n=== AIPrediction 18건 BidResult 존재 여부 ===`);
    console.log(`  BidResult 있음: ${inBR} / 없음: ${notInBR}`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

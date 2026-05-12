/**
 * 동기화 결과 채움 0건 진짜 원인 — DB 실측
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 1. BidResult 최근 1시간 신규 (G2B 수집이 데이터 가져왔는지)
    const a = await p.query(`
      SELECT COUNT(*) AS n, MAX("createdAt") AS latest, MIN("createdAt") AS earliest
      FROM "BidResult"
      WHERE "createdAt" > NOW() - INTERVAL '2 hours'
    `);
    console.log("=== 최근 2시간 BidResult 신규 ===");
    console.log(a.rows[0]);

    // 2. AIPrediction 미입력 15건 + BidResult 매칭 상태
    const b = await p.query(`
      SELECT
        ap."annId", ap."konepsId", ap."deadline", ap."title",
        br."annId" AS br_match, br."finalPrice", br."bidRate", br."winnerName"
      FROM "AIPrediction" ap
      LEFT JOIN "BidResult" br ON br."annId" = ap."konepsId"
      WHERE ap."resultFilledAt" IS NULL
      ORDER BY ap."deadline" ASC
    `);
    console.log(`\n=== AIPrediction 미입력 ${b.rows.length}건 ===`);
    let matched = 0, unmatched = 0;
    for (const r of b.rows) {
      const m = r.br_match ? "✓BR" : "✗BR";
      if (r.br_match) matched++; else unmatched++;
      const dPassed = new Date(r.deadline) < new Date() ? "마감" : "마감전";
      console.log(`  [${dPassed}] [${m}] koneps=${r.konepsId} dl=${r.deadline?.toISOString?.()?.slice(0,16) ?? r.deadline} title=${(r.title ?? "").slice(0,35)}`);
    }
    console.log(`  → 매칭 성공 ${matched} / 매칭 실패 ${unmatched}`);

    // 3. 매칭 실패한 konepsId 와 BidResult 의 annId 형식 비교
    const c = await p.query(`
      SELECT "annId" FROM "BidResult"
      WHERE "annId" LIKE 'R26%'
      ORDER BY "createdAt" DESC
      LIMIT 5
    `);
    console.log("\n=== BidResult 최근 R26* 5건 (형식 확인) ===");
    for (const r of c.rows) console.log(`  br_annId=[${r.annId}] len=${r.annId.length}`);

    // 4. 5월 신규 BidResult 일별
    const d = await p.query(`
      SELECT DATE("createdAt") AS day, COUNT(*) AS n
      FROM "BidResult"
      WHERE "createdAt" > NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day DESC
    `);
    console.log("\n=== 최근 7일 BidResult 신규 ===");
    for (const r of d.rows) console.log(`  ${r.day.toISOString().slice(0,10)}: ${r.n}건`);

    // 5. AIPrediction 의 konepsId 가 BidResult 에 있는지 (정확한 형식 비교)
    const e = await p.query(`
      WITH targets AS (
        SELECT "konepsId" FROM "AIPrediction" WHERE "resultFilledAt" IS NULL
      )
      SELECT
        t."konepsId" AS ai_koneps,
        br."annId" AS br_match
      FROM targets t
      LEFT JOIN "BidResult" br ON br."annId" = t."konepsId"
    `);
    console.log("\n=== 직접 LEFT JOIN 결과 ===");
    for (const r of e.rows) {
      console.log(`  AI [${r.ai_koneps}] → BR [${r.br_match ?? 'NULL'}]`);
    }
  } catch (e) {
    console.error("ERR:", (e as Error).message);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

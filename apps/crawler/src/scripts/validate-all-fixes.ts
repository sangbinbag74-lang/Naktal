/**
 * 박상빈님 5/18 명시: 15개 fix 전수 타당성 조사 + 비예가 심층 분석
 *
 * 각 fix 의 데이터 근거 + 박상빈님 메모리 일치 + 위험/효과 확인
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

function loadEnv(key: string): string {
  const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    if (l.startsWith(`${key}=`)) {
      return l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${key} 없음`);
}

const KEY = loadEnv("KONEPS_API_KEY");

async function callG2B(op: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`http://apis.data.go.kr/1230000/ad/BidPublicInfoService/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

(async () => {
  const pool = new Pool({ connectionString: loadEnv("DIRECT_URL"), max: 2 });
  try {
    console.log("=".repeat(70));
    console.log("F8. 비예가 심층 조사 (박상빈님 강조)");
    console.log("=".repeat(70));

    // F8-1. 비예가 공고의 contract_method 분포
    const ctrMethod = await pool.query(`
      SELECT
        COALESCE("rawJson"->>'cntrctCnclsMthdNm','-') AS contract_method,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '비예가'
      GROUP BY contract_method
      ORDER BY n DESC LIMIT 15
    `);
    console.log("\n[F8-1] 비예가 활성 공고 — 계약 방식 분포:");
    for (const r of ctrMethod.rows) {
      console.log(`  ${r.contract_method}: ${Number(r.n).toLocaleString()}건`);
    }

    // F8-2. 비예가 공고 bsisAmt 채움률
    const bsisFill = await pool.query(`
      SELECT
        CASE WHEN "bsisAmt" > 0 THEN '있음' ELSE '없음' END AS bsis,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline > NOW()
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '비예가'
      GROUP BY bsis
    `);
    console.log("\n[F8-2] 비예가 활성 공고 — bsisAmt 채움률:");
    for (const r of bsisFill.rows) {
      console.log(`  bsisAmt ${r.bsis}: ${Number(r.n).toLocaleString()}건`);
    }

    // F8-3. 비예가 + 마감 공고 BidResult 존재 여부 (사정율 분석 가능?)
    const brExists = await pool.query(`
      SELECT
        CASE WHEN br."finalPrice" IS NOT NULL AND br."bidRate" > 0 THEN 'BidResult 있음' ELSE 'BidResult 없음' END AS state,
        COUNT(*)::bigint AS n
      FROM "Announcement" a
      LEFT JOIN "BidResult" br ON br."annId" = a."konepsId"
      WHERE a.deadline >= '2026-01-01' AND a.deadline < NOW()
        AND a."rawJson"->>'prearngPrceDcsnMthdNm' = '비예가'
      GROUP BY state
    `);
    console.log("\n[F8-3] 비예가 마감 공고 (2026년) — BidResult 존재:");
    for (const r of brExists.rows) {
      console.log(`  ${r.state}: ${Number(r.n).toLocaleString()}건`);
    }

    // F8-4. 비예가 + BidResult 있는 공고 bidRate 분포 (사정율 계산 가능?)
    const bidRateRange = await pool.query(`
      SELECT
        CASE
          WHEN br."bidRate" >= 85 AND br."bidRate" <= 100 THEN '85~100% (정상 입찰)'
          WHEN br."bidRate" > 100 THEN '> 100% (특수)'
          WHEN br."bidRate" > 0 AND br."bidRate" < 85 THEN '< 85% (수의/협상)'
          ELSE 'bidRate=0 또는 NULL'
        END AS rate_range,
        COUNT(*)::bigint AS n
      FROM "Announcement" a
      JOIN "BidResult" br ON br."annId" = a."konepsId"
      WHERE a.deadline >= '2026-01-01' AND a.deadline < NOW()
        AND a."rawJson"->>'prearngPrceDcsnMthdNm' = '비예가'
      GROUP BY rate_range
      ORDER BY n DESC
    `);
    console.log("\n[F8-4] 비예가 BidResult bidRate 분포 (사정율 계산 가능 범위?):");
    for (const r of bidRateRange.rows) {
      console.log(`  ${r.rate_range}: ${Number(r.n).toLocaleString()}건`);
    }

    // F8-5. 비예가 샘플 (다양한 contract_method)
    const samples = await pool.query(`
      SELECT a."konepsId", a.title, a.category, a."bsisAmt", a.budget,
             a."rawJson"->>'cntrctCnclsMthdNm' AS contract_method,
             a."rawJson"->>'sucsfbidMthdNm' AS bid_method,
             br."bidRate", br."finalPrice"
      FROM "Announcement" a
      LEFT JOIN "BidResult" br ON br."annId" = a."konepsId"
      WHERE a.deadline >= '2026-01-01' AND a.deadline < NOW()
        AND a."rawJson"->>'prearngPrceDcsnMthdNm' = '비예가'
        AND br."bidRate" > 0
      ORDER BY RANDOM() LIMIT 5
    `);
    console.log("\n[F8-5] 비예가 + BidResult 샘플:");
    for (const r of samples.rows) {
      console.log(`  ${r.konepsId} | ${r.title.slice(0,35)}`);
      console.log(`    contract=${r.contract_method} | bid=${r.bid_method}`);
      console.log(`    budget=${Number(r.budget).toLocaleString()} | bsisAmt=${Number(r.bsisAmt).toLocaleString()} | finalPrice=${Number(r.finalPrice).toLocaleString()} | bidRate=${r.bidRate}%`);
    }

    // F1 타당성: lwlt 87.745 vs G2B 응답
    console.log("\n" + "=".repeat(70));
    console.log("F1. lwlt 89.745% 정정 — G2B 응답 vs 박상빈님 메모리");
    console.log("=".repeat(70));
    const lwltCmp = await pool.query(`
      SELECT
        "sucsfbidLwltRate"::numeric AS db_lwlt,
        "rawJson"->>'sucsfbidLwltRate' AS raw_lwlt,
        COUNT(*)::bigint AS n
      FROM "Announcement"
      WHERE deadline >= '2026-01-01' AND deadline < '2027-01-01'
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
      GROUP BY db_lwlt, raw_lwlt
      ORDER BY n DESC LIMIT 10
    `);
    console.log("\n[F1] 2026년 복수예가 lwlt DB vs rawJson:");
    for (const r of lwltCmp.rows) {
      const consistent = Math.abs(Number(r.db_lwlt) - Number(r.raw_lwlt)) < 0.001 ? "✓ 일치" : "❌ 불일치";
      console.log(`  DB=${r.db_lwlt}% / rawJson=${r.raw_lwlt} / ${consistent} / ${Number(r.n).toLocaleString()}건`);
    }

    // F3 타당성: 단일예가 공고에 BidResult 있는지
    console.log("\n" + "=".repeat(70));
    console.log("F3. 단일예가 공고 분석 제외 타당성");
    console.log("=".repeat(70));
    const singleBr = await pool.query(`
      SELECT
        CASE WHEN br."bidRate" > 0 THEN 'BidResult 있음' ELSE '없음' END AS state,
        COUNT(*)::bigint AS n
      FROM "Announcement" a
      LEFT JOIN "BidResult" br ON br."annId" = a."konepsId"
      WHERE a.deadline >= '2025-01-01' AND a.deadline < NOW()
        AND a."rawJson"->>'prearngPrceDcsnMthdNm' = '단일예가'
      GROUP BY state
    `);
    console.log("\n[F3] 단일예가 마감 공고 BidResult 존재:");
    for (const r of singleBr.rows) {
      console.log(`  ${r.state}: ${Number(r.n).toLocaleString()}건`);
    }
    // 단일예가 + BidResult bidRate 분포
    const singleBidRate = await pool.query(`
      SELECT
        CASE
          WHEN br."bidRate" >= 85 AND br."bidRate" <= 100 THEN '85~100% (정상 입찰)'
          WHEN br."bidRate" > 100 THEN '> 100%'
          ELSE '< 85%'
        END AS rate_range,
        COUNT(*)::bigint AS n
      FROM "Announcement" a
      JOIN "BidResult" br ON br."annId" = a."konepsId"
      WHERE a.deadline >= '2025-01-01' AND a.deadline < NOW()
        AND a."rawJson"->>'prearngPrceDcsnMthdNm' = '단일예가'
        AND br."bidRate" > 0
      GROUP BY rate_range
      ORDER BY n DESC
    `);
    console.log("\n[F3] 단일예가 bidRate 분포 (사정율 의미 있는지):");
    for (const r of singleBidRate.rows) {
      console.log(`  ${r.rate_range}: ${Number(r.n).toLocaleString()}건`);
    }

    // F2 타당성: G2B BsisAmount API 가 실제로 활성 공고 bsisAmt 응답 주는지
    console.log("\n" + "=".repeat(70));
    console.log("F2. 활성 bsisAmt 백필 타당성 — G2B API 실측");
    console.log("=".repeat(70));
    const targets = await pool.query(`
      SELECT "konepsId", title, category, budget
      FROM "Announcement"
      WHERE deadline > NOW() AND "bsisAmt" = 0 AND budget > 0
        AND "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가'
      LIMIT 5
    `);
    console.log(`\n[F2] 활성 복수예가 bsisAmt=0 공고 5건 — G2B BsisAmount API 호출 테스트:`);
    for (const r of targets.rows) {
      const cat = r.category;
      const op = cat.includes("공사") ? "Cnstwk" : cat.includes("물품") ? "Thng" : "Servc";
      console.log(`\n  ${r.konepsId} | ${r.title.slice(0,40)} | ${cat}`);
      try {
        const data = await callG2B(`getBidPblancListInfo${op}BsisAmount`, {
          inqryDiv: "2",
          bidNtceNo: r.konepsId,
          numOfRows: "5",
          pageNo: "1",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = (data as any)?.response?.body;
        const items = body?.items;
        if (Array.isArray(items) && items.length > 0) {
          const item = items[0];
          const bsisKey = Object.keys(item).find(k => /bsisAmt|기초/i.test(k));
          console.log(`    [${op}] totalCount=${body.totalCount} bsisAmt=${item[bsisKey ?? ""]}`);
        } else {
          console.log(`    [${op}] resultCode=${body?.resultCode ?? "?"} | totalCount=${body?.totalCount ?? 0}`);
        }
      } catch (e) {
        console.log(`    ERROR: ${(e as Error).message}`);
      }
    }

    // F11 타당성: historical bsisAmt 백필 시간 추정
    console.log("\n" + "=".repeat(70));
    console.log("F11. historical 1.52M 백필 타당성 — 추정 소요");
    console.log("=".repeat(70));
    const historical = await pool.query(`
      SELECT
        DATE_TRUNC('year', deadline)::date AS yr,
        COUNT(*)::bigint AS bsis_zero,
        COUNT(*) FILTER (WHERE "rawJson"->>'prearngPrceDcsnMthdNm' = '복수예가')::bigint AS bsis_zero_multi
      FROM "Announcement"
      WHERE "bsisAmt" = 0 AND budget > 0
        AND deadline >= '2015-01-01'
      GROUP BY yr ORDER BY yr DESC LIMIT 12
    `);
    console.log("\n[F11] 연도별 bsisAmt=0 (복수예가만 진짜 누락):");
    let totalMulti = 0;
    for (const r of historical.rows) {
      const yr = r.yr.toString().slice(0,4);
      const multi = Number(r.bsis_zero_multi);
      totalMulti += multi;
      console.log(`  ${yr}: 전체=${Number(r.bsis_zero).toLocaleString()} | 복수예가=${multi.toLocaleString()}`);
    }
    // G2B 한도 100K/일 → bulk API 면 numOfRows=999 → 한도 거의 무관
    console.log(`\n  [추정] 복수예가 (2015~) 누적: ${totalMulti.toLocaleString()}건`);
    console.log(`  [추정] bulk API 호출 (월 단위, 3 op × 200월 = 600회): 약 1~3일`);

  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });

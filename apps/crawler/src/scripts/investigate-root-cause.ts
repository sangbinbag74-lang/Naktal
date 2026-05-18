/**
 * bsisAmt 누락 + 87.745% 옛 lwlt 의 근본 원인 조사
 * 박상빈님 5/18 명시: "왜 없는지 원인부터 찾아라"
 *
 * 1. G2B API 직접 호출 → 부천고용센터 bsisAmt 응답 여부 확인
 * 2. bulk-import-extras-v2 가 본 공고 처리한 이력 확인
 * 3. sucsfbidLwltRate = 87.745% 의 출처 (G2B 응답 vs default 박힘)
 * 4. rawJson 에 bsisAmt 응답 있는지 (reparse 가능 여부)
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
const BASE = "http://apis.data.go.kr/1230000";

async function callG2B(op: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}/ad/BidPublicInfoService/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("type", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { rawText: text.slice(0, 500) }; }
}

(async () => {
  const pool = new Pool({ connectionString: loadEnv("DIRECT_URL"), max: 1 });
  try {
    // 1. 부천고용센터 rawJson 전체 확인 (DB)
    console.log("=".repeat(60));
    console.log("1. 부천고용센터 R26BK01513000 — DB rawJson 확인");
    console.log("=".repeat(60));
    const r = await pool.query(`
      SELECT "rawJson"
      FROM "Announcement"
      WHERE "konepsId" = 'R26BK01513000'
    `);
    if (r.rows.length === 0) { console.log("DB 없음"); }
    else {
      const raw = r.rows[0].rawJson;
      console.log("rawJson 키 (전체):");
      for (const k of Object.keys(raw)) {
        console.log(`  ${k}: ${JSON.stringify(raw[k])?.slice(0, 80)}`);
      }
      // bsisAmt 관련 키 검색
      const bsisKeys = Object.keys(raw).filter(k => /bsis|amt|예가|기초|예정/i.test(k));
      console.log("\nbsisAmt 관련 키:", bsisKeys);
      // 낙찰하한율 관련 키
      const lwltKeys = Object.keys(raw).filter(k => /lwlt|하한|sucsfbid/i.test(k));
      console.log("낙찰하한율 관련 키:", lwltKeys);
    }

    // 2. G2B API 직접 호출 (BsisAmount API)
    console.log("\n" + "=".repeat(60));
    console.log("2. G2B BsisAmount API 직접 호출 — 부천고용센터");
    console.log("=".repeat(60));
    // bidNtceNo 형식 = R 제외 12자리. R26BK01513000 → 26BK01513000
    const noFull = "20260512331"; // 박상빈님 공고는 noFull 추적 필요
    // 대신 inqryDiv=2 + bidNtceNo 로 단건 조회
    const ops = [
      "getBidPblancListInfoCnstwkBsisAmount",
      "getBidPblancListInfoServcBsisAmount",
      "getBidPblancListInfoThngBsisAmount",
    ];
    for (const op of ops) {
      console.log(`\n--- ${op} (단건 조회) ---`);
      try {
        const data = await callG2B(op, {
          inqryDiv: "2",
          bidNtceNo: "R26BK01513000",
          numOfRows: "10",
          pageNo: "1",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = (data as any)?.response?.body;
        const items = body?.items;
        if (Array.isArray(items)) {
          console.log(`  totalCount=${body?.totalCount} | items.length=${items.length}`);
          for (const item of items.slice(0, 2)) {
            const keys = Object.keys(item);
            const bsisKey = keys.find(k => /bsisAmt|기초/i.test(k));
            const lwltKey = keys.find(k => /sucsfbidLwlt|하한/i.test(k));
            console.log(`  bsisAmt key=${bsisKey}, value=${item[bsisKey ?? ""]}`);
            console.log(`  lwlt key=${lwltKey}, value=${item[lwltKey ?? ""]}`);
          }
        } else {
          console.log(`  resultCode=${body?.resultCode ?? "?"} resultMsg=${body?.resultMsg ?? "?"}`);
        }
      } catch (e) {
        console.log(`  ERROR: ${(e as Error).message}`);
      }
    }

    // 3. G2B 공고 목록 API 호출 (원본 응답에 bsisAmt 있는지)
    console.log("\n" + "=".repeat(60));
    console.log("3. G2B 공고 목록 API (원본) — bsisAmt 응답?");
    console.log("=".repeat(60));
    const listOps = [
      "getBidPblancListInfoCnstwk",
      "getBidPblancListInfoServc",
      "getBidPblancListInfoThng",
    ];
    for (const op of listOps) {
      console.log(`\n--- ${op} (단건 조회) ---`);
      try {
        const data = await callG2B(op, {
          inqryDiv: "2",
          bidNtceNo: "R26BK01513000",
          numOfRows: "10",
          pageNo: "1",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = (data as any)?.response?.body;
        const items = body?.items;
        if (Array.isArray(items) && items.length > 0) {
          const item = items[0];
          const keys = Object.keys(item);
          const bsisKey = keys.find(k => /bsisAmt|기초/i.test(k));
          const lwltKey = keys.find(k => /sucsfbidLwlt|하한/i.test(k));
          const aValKey = keys.find(k => /aValue|aval/i.test(k));
          const rngKey = keys.find(k => /rsrvtnPrce.*Bgn/i.test(k));
          console.log(`  totalCount=${body?.totalCount}`);
          console.log(`  bsisAmt(${bsisKey})=${item[bsisKey ?? ""]}`);
          console.log(`  lwlt(${lwltKey})=${item[lwltKey ?? ""]}`);
          console.log(`  aValue(${aValKey})=${item[aValKey ?? ""]}`);
          console.log(`  rsrvtnPrceRngBgn(${rngKey})=${item[rngKey ?? ""]}`);
          console.log(`  bidNtceNm=${item.bidNtceNm}`);
          console.log(`  presmptPrce=${item.presmptPrce}`); // 추정가격
        } else {
          console.log(`  resultCode=${body?.resultCode ?? "?"} resultMsg=${body?.resultMsg ?? "?"} | total=${body?.totalCount ?? "?"}`);
        }
      } catch (e) {
        console.log(`  ERROR: ${(e as Error).message}`);
      }
    }

    // 4. mapToRow / parseSchema 의 bsisAmt 처리 확인
    console.log("\n" + "=".repeat(60));
    console.log("4. CrawlLog — 본 공고 수집 시점/이력");
    console.log("=".repeat(60));
    const cl = await pool.query(`
      SELECT *
      FROM "CrawlLog"
      WHERE message LIKE '%R26BK01513000%' OR detail::text LIKE '%R26BK01513000%'
      ORDER BY "createdAt" DESC
      LIMIT 5
    `).catch(() => null);
    if (cl) {
      console.log(`CrawlLog 매칭: ${cl.rowCount}건`);
      for (const c of cl.rows) console.log(JSON.stringify({ createdAt: c.createdAt, type: c.type, message: c.message?.slice(0,100) }));
    } else {
      console.log("CrawlLog 컬럼 매칭 안 됨 (스키마 차이)");
    }

    // 5. 87.745% 옛값 출처 — 학습 통계? G2B 직접?
    console.log("\n" + "=".repeat(60));
    console.log("5. 87.745% 옛 lwlt 출처 추적 — 활성 공고 rawJson");
    console.log("=".repeat(60));
    const oldLwlt = await pool.query(`
      SELECT "konepsId", title, category, "sucsfbidLwltRate", "rawJson"->>'sucsfbidLwltRate' AS raw_lwlt
      FROM "Announcement"
      WHERE ABS("sucsfbidLwltRate" - 87.745) < 0.001
        AND deadline > NOW()
      LIMIT 5
    `);
    for (const r of oldLwlt.rows) {
      console.log(`  ${r.konepsId} | ${r.title.slice(0,40)} | DB=${r.sucsfbidLwltRate} | rawJson.sucsfbidLwltRate=${r.raw_lwlt}`);
    }
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });

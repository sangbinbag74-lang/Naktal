/**
 * 5/12 마감 BPP 전체 OpengCompt 직접 호출로 BidResult 채움
 * (refresh-outcomes 의 AIPrediction 채움 블록은 resultFilledAt IS NULL 조건으로
 *  처리하므로, BPP 만 있고 AIPrediction 자체가 없는 row 는 건드리지 않음.
 *  이 스크립트는 BPP 가 있는 모든 마감 row 를 OpengCompt 로 직접 매칭)
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
function val(name: string): string {
  const line = env.split("\n").find(l => l.startsWith(name + "="));
  return line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";
}
const KEY = val("KONEPS_API_KEY");
const url = val("DIRECT_URL");

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const COMPT_OPS = [
  "getOpengResultListInfoOpengCompt",
  "getOpengResultListInfoCnstwkOpengCompt",
  "getOpengResultListInfoServcOpengCompt",
  "getOpengResultListInfoThngOpengCompt",
];

function toYMD(d: Date): string {
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}

async function fetchOpengCompt(koneps: string, deadline: Date): Promise<{
  finalPrice: string; bidRate: string; winnerName: string | null; numBidders: number;
} | null> {
  for (const op of COMPT_OPS) {
    const params = new URLSearchParams({
      serviceKey: KEY, type: "json", inqryDiv: "1",
      bidNtceNo: koneps, bidNtceOrd: "000",
      inqryBgnDt: toYMD(new Date(deadline.getTime() - 3 * 86400000)) + "0000",
      inqryEndDt: toYMD(new Date(deadline.getTime() + 15 * 86400000)) + "2359",
      numOfRows: "999", pageNo: "1",
    });
    try {
      const res = await fetch(`${BASE}/${op}?${params.toString()}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (data as any)?.response?.body;
      let items = body?.items ?? [];
      if (!Array.isArray(items)) items = items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matched = items.filter((i: any) => i.bidNtceNo?.trim() === koneps);
      if (matched.length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const winner = matched.find((i: any) => String(i.opengRank ?? "").trim() === "1");
      if (!winner) continue;
      const price = parseInt(String(winner.bidprcAmt ?? "0").replace(/\D/g, ""), 10);
      const rate = parseFloat(String(winner.bidprcrt ?? "0"));
      if (price <= 0 || rate <= 0) continue;
      return {
        finalPrice: String(price),
        bidRate: rate.toFixed(3),
        winnerName: String(winner.prcbdrNm ?? "").trim() || null,
        numBidders: matched.length,
      };
    } catch { /* next */ }
  }
  return null;
}

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // BPP + Announcement 매칭. 마감 지났고 BidResult 없는 row 모두
    const targets = await p.query(`
      SELECT a."konepsId", a.title, a.deadline
      FROM "BidPricePrediction" bpp
      JOIN "Announcement" a ON a.id = bpp."annId"
      LEFT JOIN "BidResult" br ON br."annId" = a."konepsId"
      WHERE a.deadline < NOW()
        AND br."annId" IS NULL
        AND a."konepsId" IS NOT NULL
      ORDER BY a.deadline DESC
      LIMIT 300
    `);
    console.log(`백필 대상 ${targets.rows.length}건 (BPP 있고 마감 지났고 BidResult 없는 공고)`);

    let inserted = 0, miss = 0, i = 0;
    for (const r of targets.rows) {
      i++;
      const result = await fetchOpengCompt(r.konepsId, new Date(r.deadline));
      if (!result) {
        miss++;
        if (i % 20 === 0) console.log(`  진행 ${i}/${targets.rows.length}: 매칭=${inserted} 미게재=${miss}`);
        continue;
      }
      await p.query(
        `INSERT INTO "BidResult" ("id","annId","bidRate","finalPrice","numBidders","winnerName","openedAt","createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NULL, NOW())
         ON CONFLICT ("annId") DO UPDATE SET
           "bidRate" = EXCLUDED."bidRate", "finalPrice" = EXCLUDED."finalPrice",
           "numBidders" = EXCLUDED."numBidders", "winnerName" = EXCLUDED."winnerName"`,
        [r.konepsId, result.bidRate, result.finalPrice, result.numBidders, result.winnerName]
      );
      inserted++;
      if (i % 20 === 0 || i === targets.rows.length) {
        console.log(`  진행 ${i}/${targets.rows.length}: 매칭=${inserted} 미게재=${miss}`);
      }
    }
    console.log(`\n결과: BidResult 신규 ${inserted}건 / G2B 미게재 ${miss}건 / 총 ${targets.rows.length}건`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

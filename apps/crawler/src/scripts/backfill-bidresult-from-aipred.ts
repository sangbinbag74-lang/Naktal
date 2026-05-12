/**
 * AIPrediction.actualSajungRate 채워졌는데 BidResult 가 비어있는 row 백필
 * G2B 단건 조회로 BidResult upsert → winnerName / finalPrice / bidRate 채움
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
const SCSBID_OPS = ["getScsbidListSttusCnstwk", "getScsbidListSttusServc", "getScsbidListSttusThng", "getScsbidListSttusFrgcpt"];
const OPENG_OPS = ["getOpengResultListInfoCnstwk", "getOpengResultListInfoServc", "getOpengResultListInfoThng"];

function toYMD(d: Date): string {
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}

interface BidResultData {
  annId: string; bidRate: string; finalPrice: string;
  numBidders: number; winnerName: string | null; openedAt: string | null;
}

// SCSBID 4 op + 다양한 inqryDiv/날짜 조합으로 매칭률 최대화
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryAllVariants(koneps: string, deadline: Date): Promise<any | null> {
  // 시도 순서:
  // 1) inqryDiv=2 (개찰일자) 마감 -2 ~ +30일
  // 2) inqryDiv=1 (공고일자) 마감 -40 ~ +30일 (공고는 마감 전에 등록됨)
  const ranges: { div: "1" | "2"; from: number; to: number }[] = [
    { div: "2", from: -2,  to: 30 },
    { div: "1", from: -40, to: 30 },
  ];
  for (const range of ranges) {
    const fromDate = toYMD(new Date(deadline.getTime() + range.from * 86400000)) + "0000";
    const toDate = toYMD(new Date(deadline.getTime() + range.to * 86400000)) + "2359";
    for (const op of SCSBID_OPS) {
      const params = new URLSearchParams({
        serviceKey: KEY, type: "json", inqryDiv: range.div,
        inqryBgnDt: fromDate, inqryEndDt: toDate,
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
        const m = items.find((i: any) => i.bidNtceNo?.trim() === koneps);
        if (m) return { source: `SCSBID ${op} div=${range.div}`, item: m };
      } catch { /* next */ }
    }
  }
  // OpengResult fallback
  for (const op of OPENG_OPS) {
    const fromDate = toYMD(new Date(deadline.getTime() - 2 * 86400000)) + "0000";
    const toDate = toYMD(new Date(deadline.getTime() + 30 * 86400000)) + "2359";
    const params = new URLSearchParams({
      serviceKey: KEY, type: "json", inqryDiv: "1",
      inqryBgnDt: fromDate, inqryEndDt: toDate,
      bidNtceNo: koneps, bidNtceOrd: "000",
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
      const m = items.find((i: any) => i.bidNtceNo?.trim() === koneps);
      if (m && m.opengCorpInfo) return { source: `OpengResult ${op}`, item: m, isOpeng: true };
    } catch { /* next */ }
  }
  return null;
}

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // AIPrediction.actualSajungRate 채워졌는데 BidResult 가 비어있는 row
    const rows = await p.query(`
      SELECT ap."konepsId", ap."title", ap."deadline"
      FROM "AIPrediction" ap
      LEFT JOIN "BidResult" br ON br."annId" = ap."konepsId"
      WHERE ap."actualSajungRate" IS NOT NULL
        AND br."annId" IS NULL
    `);
    console.log(`백필 대상 ${rows.rows.length}건 (AIPrediction 결과 있는데 BidResult 없음)`);

    let inserted = 0, miss = 0;
    for (const r of rows.rows) {
      const found = await tryAllVariants(r.konepsId, new Date(r.deadline));
      if (!found) {
        console.log(`  ✗ ${r.konepsId} ${(r.title ?? "").slice(0,30)} — G2B 미게재`);
        miss++;
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = found.item as any;
      let row: BidResultData | null = null;
      if (found.isOpeng) {
        const parts = String(item.opengCorpInfo).split("^");
        if (parts.length >= 5) {
          const price = parseInt((parts[3] || "").replace(/\D/g, ""), 10) || 0;
          const rate = parseFloat(parts[4] || "0") || 0;
          if (price > 0 && rate > 0) {
            row = {
              annId: r.konepsId,
              bidRate: rate.toString(),
              finalPrice: String(price),
              numBidders: parseInt(String(item.prtcptCnum || "0").replace(/\D/g, ""), 10),
              winnerName: parts[0]?.trim() || null,
              openedAt: null,
            };
          }
        }
      } else {
        const rateRaw = (item.sucsfbidRate || "").replace(/[^0-9.]/g, "");
        const priceRaw = (item.sucsfbidAmt || "").replace(/[^0-9]/g, "");
        if (rateRaw && priceRaw) {
          row = {
            annId: r.konepsId,
            bidRate: parseFloat(rateRaw).toFixed(3),
            finalPrice: String(parseInt(priceRaw, 10)),
            numBidders: parseInt((item.prtcptCnum || item.totPrtcptCo || "0").replace(/[^0-9]/g, ""), 10),
            winnerName: item.sucsfbidCorpNm?.trim() || item.bidwinnrNm?.trim() || null,
            openedAt: null,
          };
        }
      }
      if (!row) { miss++; continue; }
      await p.query(
        `INSERT INTO "BidResult" ("id","annId","bidRate","finalPrice","numBidders","winnerName","openedAt","createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NULL, NOW())
         ON CONFLICT ("annId") DO UPDATE SET
           "bidRate" = EXCLUDED."bidRate", "finalPrice" = EXCLUDED."finalPrice",
           "numBidders" = EXCLUDED."numBidders", "winnerName" = EXCLUDED."winnerName"`,
        [row.annId, row.bidRate, row.finalPrice, row.numBidders, row.winnerName]
      );
      console.log(`  ✓ ${r.konepsId} ${(r.title ?? "").slice(0,25)} winner=${(row.winnerName ?? "").slice(0,15)} price=${Number(row.finalPrice).toLocaleString()}`);
      inserted++;
    }
    console.log(`\n결과: BidResult 신규 ${inserted} / G2B 미게재 ${miss}`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await p.end();
    process.exit(0);
  }
})();

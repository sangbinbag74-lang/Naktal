/**
 * [타당성 검사] bid-rank.ts 등수 계산 — 실제 부적격 공고로 검증
 *  - 2014 공고(낙찰하한선 미달 있음) OpengCompt 조회 → rankBidders → 적격 +N / 부적격 -N 확인
 */
import * as fs from "fs";
import * as path from "path";

// bid-rank.ts(web ESM)는 crawler(CJS)에서 import 불가 → 동일 로직 인라인 복제로 검증
const BELOW_KEYWORDS = ["낙찰하한", "미달", "무효"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classify(rmrk: any, opengRank: any): string { const r = String(rmrk ?? "").trim(); if (r.includes("예가초과") || r.includes("예정가")) return "over"; if (parseInt(String(opengRank ?? "0"), 10) > 0 && !BELOW_KEYWORDS.some((k) => r.includes(k))) return "eligible"; return "below"; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function priceOf(c: any): number { return parseInt(String(c.bidprcAmt ?? "0").replace(/[^0-9]/g, ""), 10) || 0; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rankBidders(items: any[]): any[] {
  const belowList = items.filter((c) => classify(c.rmrk, c.opengRank) === "below").sort((a, b) => priceOf(b) - priceOf(a));
  const belowRank = new Map<unknown, number>();
  belowList.forEach((c, i) => belowRank.set(c, -(i + 1)));
  return items.map((c) => { const kind = classify(c.rmrk, c.opengRank); const rank = kind === "eligible" ? (parseInt(String(c.opengRank ?? "0"), 10) || 0) : kind === "below" ? (belowRank.get(c) ?? -999) : 0; return { corpNm: String(c.prcbdrNm ?? "").trim(), bidPrice: priceOf(c), bidRate: parseFloat(String(c.bidprcrt ?? "0")) || 0, rank, disqualified: kind !== "eligible", overLimit: kind === "over", rmrk: String(c.rmrk ?? "").trim() }; });
}

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
function val(n: string): string {
  const l = env.split("\n").find((x) => x.startsWith(n + "="));
  return l ? l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";
}
const KEY = val("KONEPS_API_KEY") || val("G2B_API_KEY");
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
function toYMD(d: Date): string { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCompt(koneps: string, deadline: Date): Promise<any[]> {
  const ops = ["getOpengResultListInfoOpengCompt", "getOpengResultListInfoCnstwkOpengCompt"];
  for (const op of ops) {
    const params = new URLSearchParams({
      serviceKey: KEY, type: "json", inqryDiv: "1", bidNtceNo: koneps, bidNtceOrd: "000",
      inqryBgnDt: toYMD(new Date(deadline.getTime() - 3 * 86400000)) + "0000",
      inqryEndDt: toYMD(new Date(deadline.getTime() + 20 * 86400000)) + "2359",
      numOfRows: "999", pageNo: "1",
    });
    try {
      const res = await fetch(`${BASE}/${op}?${params.toString()}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j = (await res.json()) as any;
      if (j?.response?.header?.resultCode !== "00") continue;
      let items = j?.response?.body?.items ?? [];
      if (!Array.isArray(items)) items = items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matched = items.filter((i: any) => String(i.bidNtceNo ?? "").trim() === koneps);
      if (matched.length > 0) return matched;
    } catch { /* next */ }
  }
  return [];
}

(async () => {
  if (!KEY) { console.error("KEY 없음"); process.exit(1); }
  const items = await fetchCompt("20140809299", new Date("2014-08-20"));
  console.log(`입찰자 ${items.length}명 조회`);
  if (items.length === 0) { console.log("조회 실패 — 다른 공고 필요"); process.exit(0); }

  const ranked = rankBidders(items);
  const elig = ranked.filter((r) => r.rank > 0).sort((a, b) => a.rank - b.rank);
  const disq = ranked.filter((r) => r.rank < 0).sort((a, b) => b.rank - a.rank); // -1, -2, -3...

  console.log(`\n=== 적격 +N등 (상위 3) — opengRank 일치 확인 ===`);
  elig.slice(0, 3).forEach((r) => console.log(`  +${r.rank}등  ${r.corpNm}  투찰 ${r.bidPrice.toLocaleString()}  ${r.bidRate}%`));
  console.log(`=== 부적격 -N등 (상위 3, 하한가 근접순) ===`);
  disq.slice(0, 3).forEach((r) => console.log(`  ${r.rank}등  ${r.corpNm}  투찰 ${r.bidPrice.toLocaleString()}  [${r.rmrk}]`));

  console.log(`\n=== 검증 ===`);
  console.log(`  적격 ${elig.length}명 / 부적격 ${disq.length}명 / 합 ${ranked.length}`);
  if (disq.length >= 2) {
    const ok = disq[0]!.bidPrice >= disq[1]!.bidPrice;
    console.log(`  부적격 -1등 투찰가(${disq[0]!.bidPrice.toLocaleString()}) >= -2등(${disq[1]!.bidPrice.toLocaleString()}): ${ok ? "✅ 맞음(하한가 근접=−1)" : "❌ 틀림"}`);
  }
  if (elig.length >= 1) {
    console.log(`  적격 +1등 = 낙찰최저가 ${elig[0]!.bidPrice.toLocaleString()} (opengRank 1)`);
  }
  process.exit(0);
})();

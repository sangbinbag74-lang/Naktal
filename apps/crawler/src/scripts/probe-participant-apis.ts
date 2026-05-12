/**
 * G2B 참여자별 투찰가 list 가능한 API 후보 probe.
 * 응답 코드 + 응답 본문 첫 600자 출력.
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}

const KEY = process.env.KONEPS_API_KEY || process.env.G2B_API_KEY;
if (!KEY) { console.error("KONEPS_API_KEY missing"); process.exit(1); }

const BASE = "https://apis.data.go.kr/1230000";

// path 다양화 probe — 미발견 endpoint 찾기
const CANDIDATES: Array<{ path: string; svc: string; op: string }> = [
  // 다른 path 추측 (at, ap, ar, am, ah, an, av)
  { path: "at", svc: "ScsbidInfoService",       op: "getOpengResultListInfo" },
  { path: "ap", svc: "ScsbidInfoService",       op: "getOpengResultListInfo" },
  { path: "ar", svc: "ScsbidInfoService",       op: "getOpengResultListInfo" },
  // 별도 service 추측 (getBidPblancListInfo + 변형)
  { path: "ad", svc: "BidPublicInfoService",    op: "getBidPblancListInfoOpengResult" },
  { path: "ad", svc: "BidPublicInfoService",    op: "getBidPblancListInfoBidPrcRank" },
  { path: "ad", svc: "BidPublicInfoService",    op: "getBidPblancListInfoBidPrcResultCnstwk" },
  // ScsbidInfoService 변형
  { path: "as", svc: "ScsbidInfoService",       op: "getScsbidListSttusBidPrcCnstwk" },
  { path: "as", svc: "ScsbidInfoService",       op: "getScsbidListSttusBidPrcInfo" },
  { path: "as", svc: "ScsbidInfoService",       op: "getOpengCorpInfo" },
  // 신규 서비스 가능성
  { path: "as", svc: "BidPrcRankInfoService",   op: "getBidPrcRankList" },
  { path: "ad", svc: "BidPrcInfoService",       op: "getBidPrcRankList" },
  { path: "as", svc: "OpengResultDtlsInfoService", op: "getOpengResultDtlsList" },
  // OpengPrcInfoService (예비가격용 — 가능성)
  { path: "ad", svc: "OpengPrcInfoService",     op: "getOpengPrcList" },
  { path: "as", svc: "OpengPrcInfoService",     op: "getOpengPrcList" },
  // bidwinner 외 모든 참여자 list 가능 후보 — `getBidPblancListInfoSucsfbidScale`
  { path: "ad", svc: "BidPublicInfoService",    op: "getBidPblancListInfoSucsfbidScale" },
];

async function probe(p: string, svc: string, op: string): Promise<{ status: number; body: string }> {
  const params = new URLSearchParams({
    serviceKey: KEY!,
    pageNo: "1",
    numOfRows: "3",
    inqryDiv: "1",
    inqryBgnDt: "202604010000",
    inqryEndDt: "202604152359",
    type: "json",
  });
  const url = `${BASE}/${p}/${svc}/${op}?${params}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 800) };
  } catch (e) {
    return { status: -1, body: (e as Error).message };
  }
}

(async () => {
  for (const { path: p, svc, op } of CANDIDATES) {
    const r = await probe(p, svc, op);
    const isJson = r.body.startsWith("{");
    const has404 = r.body.includes("API not found") || r.body.includes("NOT_FOUND");
    const tag = r.status === 200 && isJson && !has404 ? "✅" : has404 ? "❌" : "⚠️";
    console.log(`\n${tag} ${p}/${svc}/${op}  HTTP=${r.status}  JSON=${isJson}`);
    console.log("  " + r.body.replace(/\n/g, "\n  ").slice(0, 500));
  }
})();

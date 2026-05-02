/**
 * getOpengResultListInfo{Thng,Cnstwk,Servc,Frgcpt}PreparPcDetail 존재·스키마 실측
 *
 * 목적: Model 2 블로커 해소 — 15개 예비가 + 선택 4개 번호 반환 여부 확인
 */
import * as path from "path";
import * as fs from "fs";

function loadKey(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  let koneps = "";
  let g2b = "";
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "KONEPS_API_KEY" && v && !/[가-힣]/.test(v)) koneps = v;
    else if (k === "G2B_API_KEY" && v && !/[가-힣]/.test(v)) g2b = v;
  }
  return koneps || g2b || (() => { throw new Error("유효한 API 키 없음"); })();
}

const KEY = loadKey();
const BASE_MAP: Record<string, string> = {
  "getOpengResult": "https://apis.data.go.kr/1230000/as/ScsbidInfoService",
  "getBidPblanc":   "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
};
function baseFor(op: string): string {
  for (const [pre, b] of Object.entries(BASE_MAP)) if (op.startsWith(pre)) return b;
  throw new Error("unknown op prefix: " + op);
}
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService"; // legacy — no longer used directly
const OPS = [
  // 대조군: 기존 작동하는 op — 인증 문제인지 확인용
  "getOpengResultListInfoThng",
  // 추정 op — 4개 업종 × 예비가 상세
  "getOpengResultListInfoThngPreparPcDetail",
  "getOpengResultListInfoCnstwkPreparPcDetail",
  "getOpengResultListInfoServcPreparPcDetail",
  "getOpengResultListInfoFrgcptPreparPcDetail",
  // 다른 이름 가능성
  "getOpengResultListInfoThngPrdprc",
  "getOpengResultListInfoThngPreparPc",
];

async function probe(op: string): Promise<void> {
  // bulk-opening.ts 와 동일한 URL builder 패턴 (double-encoding 방지)
  const url = new URL(`${BASE}/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", "202403010000");
  url.searchParams.set("inqryEndDt", "202403012359");
  url.searchParams.set("numOfRows", "3");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  console.log(`\n=== ${op} ===`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const status = res.status;
    const text = await res.text();
    console.log(`HTTP ${status}`);

    // XML 에러 또는 JSON 검사
    if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED") || text.includes("NO_OPENAPI_SERVICE")) {
      console.log("  ❌ 서비스 미등록 또는 키 문제 (처음 200자):", text.slice(0, 200));
      return;
    }
    try {
      const j = JSON.parse(text);
      const body = j?.response?.body;
      const total = body?.totalCount;
      const items = body?.items;
      console.log(`  totalCount: ${total}`);
      if (Array.isArray(items) && items.length > 0) {
        console.log(`  첫 item keys: ${Object.keys(items[0]).join(", ")}`);
        console.log(`  첫 item 샘플:`, JSON.stringify(items[0], null, 2).slice(0, 800));
      } else if (items?.item) {
        const it = Array.isArray(items.item) ? items.item[0] : items.item;
        console.log(`  첫 item keys: ${Object.keys(it).join(", ")}`);
        console.log(`  첫 item 샘플:`, JSON.stringify(it, null, 2).slice(0, 800));
      } else {
        console.log("  items 비어있음");
      }
    } catch {
      console.log("  JSON 파싱 실패. 응답 시작:", text.slice(0, 300));
    }
  } catch (e) {
    console.error("  fetch 실패:", (e as Error).message);
  }
}

(async () => {
  for (const op of OPS) await probe(op);
})();

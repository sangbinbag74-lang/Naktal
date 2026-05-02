/**
 * 수집 전 타당성 검토 — 3개 API 실제 응답 필드 실측
 *   LicenseLimit: indstrytyMfrcFldList 존재 여부
 *   CalclA: sftyMngcst 등 7개 A값 필드 존재 여부
 *   ChgHstryCnstwk: 실제 필드명 (chgNtceRsnNm/Seq/Dt vs chgItemNm/chgDt 등)
 */
import * as path from "path";
import * as fs from "fs";

function loadKey(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  let koneps = "", g2b = "";
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
  return koneps || g2b || (() => { throw new Error("API key missing"); })();
}

const KEY = loadKey();
const BASE_BID = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

const TARGETS = [
  { op: "getBidPblancListInfoLicenseLimit", label: "LicenseLimit (→ subCategories)" },
  { op: "getBidPblancListBidPrceCalclAInfo", label: "CalclA (→ aValueTotal)" },
  { op: "getBidPblancListInfoChgHstryCnstwk", label: "ChgHstryCnstwk (→ chgRsnNm?)" },
];

async function probe(op: string, label: string): Promise<void> {
  process.stdout.write(`\n=== ${op} ===\n${label}\n`);
  const url = new URL(`${BASE_BID}/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", "202403010000");
  url.searchParams.set("inqryEndDt", "202403012359");
  url.searchParams.set("numOfRows", "3");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    process.stdout.write(`HTTP ${res.status}\n`);
    if (!res.ok) { process.stdout.write(`응답: ${text.slice(0, 200)}\n`); return; }
    try {
      const j = JSON.parse(text);
      const body = j?.response?.body;
      const total = body?.totalCount;
      process.stdout.write(`totalCount: ${total}\n`);
      let items: unknown[] = [];
      if (Array.isArray(body?.items)) items = body.items;
      else if (body?.items?.item) items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      if (items.length === 0) { process.stdout.write(`items 비어있음\n`); return; }
      const first = items[0] as Record<string, unknown>;
      process.stdout.write(`첫 item keys (${Object.keys(first).length}개):\n  ${Object.keys(first).join(", ")}\n`);
      process.stdout.write(`첫 item 전체:\n${JSON.stringify(first, null, 2).slice(0, 1500)}\n`);
    } catch (e) {
      process.stdout.write(`JSON 파싱 실패: ${(e as Error).message}\n응답 시작: ${text.slice(0, 200)}\n`);
    }
  } catch (e) {
    process.stdout.write(`fetch 실패: ${(e as Error).message}\n`);
  }
}

(async () => {
  for (const t of TARGETS) await probe(t.op, t.label);
})();

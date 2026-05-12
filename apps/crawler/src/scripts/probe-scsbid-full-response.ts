/**
 * 1. ScsbidInfoService 전체 응답 필드 확인 (numOfRows=1 + bulk)
 * 2. inqryDiv=2 단건 조회 시 추가 필드 있는지 확인
 * 3. 다른 ScsbidInfoService 변형 endpoint 추가 probe
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

async function call(url: string): Promise<{ status: number; body: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    return { status: res.status, body };
  } catch (e) {
    return { status: -1, body: (e as Error).message };
  }
}

(async () => {
  // 1. getScsbidListSttusCnstwk bulk numOfRows=1 — 전체 필드 보기
  console.log("=".repeat(80));
  console.log("[1] getScsbidListSttusCnstwk bulk full row");
  const url1 = `${BASE}/as/ScsbidInfoService/getScsbidListSttusCnstwk?serviceKey=${KEY}&pageNo=1&numOfRows=1&inqryDiv=1&inqryBgnDt=202604010000&inqryEndDt=202604152359&type=json`;
  const r1 = await call(url1);
  console.log(`HTTP ${r1.status}`);
  try {
    const j = JSON.parse(r1.body);
    const item = j.response?.body?.items?.[0];
    if (item) {
      console.log("ALL FIELDS (" + Object.keys(item).length + "):");
      for (const k of Object.keys(item)) {
        const v = String(item[k] ?? "").slice(0, 60);
        console.log(`  ${k} = ${v}`);
      }
    } else {
      console.log(r1.body.slice(0, 500));
    }
  } catch { console.log(r1.body.slice(0, 500)); }

  // 2. getOpengResultListInfoCnstwk bulk numOfRows=1
  console.log("\n" + "=".repeat(80));
  console.log("[2] getOpengResultListInfoCnstwk bulk full row");
  const url2 = `${BASE}/as/ScsbidInfoService/getOpengResultListInfoCnstwk?serviceKey=${KEY}&pageNo=1&numOfRows=1&inqryDiv=1&inqryBgnDt=202604010000&inqryEndDt=202604152359&type=json`;
  const r2 = await call(url2);
  console.log(`HTTP ${r2.status}`);
  try {
    const j = JSON.parse(r2.body);
    const item = j.response?.body?.items?.[0];
    if (item) {
      console.log("ALL FIELDS (" + Object.keys(item).length + "):");
      for (const k of Object.keys(item)) {
        const v = String(item[k] ?? "").slice(0, 60);
        console.log(`  ${k} = ${v}`);
      }
    } else {
      console.log(r2.body.slice(0, 500));
    }
  } catch { console.log(r2.body.slice(0, 500)); }

  // 3. inqryDiv=2 단건 조회 (실제 공고번호 사용)
  // 위에서 받은 bidNtceNo 사용
  let testNo = "R26BK01423034"; // 위 probe에서 발견된 실제 번호
  try {
    const j = JSON.parse(r1.body);
    const item = j.response?.body?.items?.[0];
    if (item?.bidNtceNo) testNo = item.bidNtceNo;
  } catch {}

  console.log("\n" + "=".repeat(80));
  console.log(`[3] inqryDiv=2 단건 조회 — bidNtceNo=${testNo}`);
  const url3 = `${BASE}/as/ScsbidInfoService/getScsbidListSttusCnstwk?serviceKey=${KEY}&pageNo=1&numOfRows=10&inqryDiv=2&bidNtceNo=${testNo}&type=json`;
  const r3 = await call(url3);
  console.log(`HTTP ${r3.status}`);
  try {
    const j = JSON.parse(r3.body);
    const items = j.response?.body?.items ?? [];
    console.log(`items count = ${items.length}`);
    if (items.length > 0) {
      const item = items[0];
      console.log("ALL FIELDS row 0 (" + Object.keys(item).length + "):");
      for (const k of Object.keys(item)) {
        const v = String(item[k] ?? "").slice(0, 80);
        console.log(`  ${k} = ${v}`);
      }
    }
  } catch { console.log(r3.body.slice(0, 500)); }

  // 4. getOpengResultListInfoCnstwk inqryDiv=2 (단건)
  console.log("\n" + "=".repeat(80));
  console.log(`[4] getOpengResultListInfoCnstwk inqryDiv=2 — bidNtceNo=${testNo}`);
  const url4 = `${BASE}/as/ScsbidInfoService/getOpengResultListInfoCnstwk?serviceKey=${KEY}&pageNo=1&numOfRows=10&inqryDiv=2&bidNtceNo=${testNo}&type=json`;
  const r4 = await call(url4);
  console.log(`HTTP ${r4.status}`);
  try {
    const j = JSON.parse(r4.body);
    const items = j.response?.body?.items ?? [];
    console.log(`items count = ${items.length}`);
    if (items.length > 0) {
      const item = items[0];
      console.log("ALL FIELDS row 0 (" + Object.keys(item).length + "):");
      for (const k of Object.keys(item)) {
        const v = String(item[k] ?? "").slice(0, 80);
        console.log(`  ${k} = ${v}`);
      }
    }
  } catch { console.log(r4.body.slice(0, 500)); }

  // 5. ScsbidInfoService 추가 미발견 endpoint 시도 (낙찰 정보 카탈로그 추측)
  console.log("\n" + "=".repeat(80));
  console.log("[5] 추가 endpoint probe");
  const more = [
    "getScsbidListSttusBidwinnrInfo",
    "getScsbidListSttusBidPrcRslt",
    "getScsbidListSttusBidPrcInfo",
    "getScsbidListBidPrcInfoCnstwk",
    "getScsbidListBidPrcInfoServc",
    "getScsbidListBidPrcInfoThng",
    "getOpengResultListInfoBidPrcCnstwk",
    "getOpengResultBidPrcInfoCnstwk",
    "getOpengResultPrtcptInfoCnstwk",
    "getBidPrtcptInfoCnstwk",
    "getOpengCorpListInfoCnstwk",
    "getScsbidPrtcptCorpListInfoCnstwk",
    "getScsbidListSttusBidPrtcptCorpInfoCnstwk",
  ];
  for (const op of more) {
    const u = `${BASE}/as/ScsbidInfoService/${op}?serviceKey=${KEY}&pageNo=1&numOfRows=1&inqryDiv=2&bidNtceNo=${testNo}&type=json`;
    const r = await call(u);
    const isJson = r.body.startsWith("{");
    const has404 = r.body.includes("API not found");
    if (!has404) {
      console.log(`\n${isJson ? "✅" : "⚠️"} ${op}  HTTP=${r.status}`);
      console.log("  " + r.body.slice(0, 300).replace(/\n/g, "\n  "));
    }
  }
})();

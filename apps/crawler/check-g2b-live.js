/**
 * G2B API 직접 호출 - 실제 응답 필드 확인
 * 3개 엔드포인트(Cnstwk/Servc/Thng) 각 1페이지씩
 */
const fs = require("fs"), path = require("path");

function getEnv() {
  const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf-8");
  const result = {};
  for (const l of env.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    result[k] = v;
  }
  return result;
}

const env = getEnv();
const API_KEY = env.G2B_API_KEY || env.KONEPS_API_KEY;
const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

async function fetchSample(operation) {
  const url = new URL(`${BASE}/${operation}`);
  url.searchParams.set("serviceKey", API_KEY);
  url.searchParams.set("numOfRows", "3");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", "202504010000");
  url.searchParams.set("inqryEndDt", "202504042359");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  const data = await res.json();

  const items = data?.response?.body?.items?.item;
  const list = Array.isArray(items) ? items : (items ? [items] : []);
  return list;
}

(async () => {
  const OPS = [
    "getBidPblancListInfoCnstwk",  // 공사
    "getBidPblancListInfoServc",   // 용역
    "getBidPblancListInfoThng",    // 물품
  ];

  for (const op of OPS) {
    console.log("\n" + "=".repeat(60));
    console.log(`엔드포인트: ${op}`);
    console.log("=".repeat(60));

    const items = await fetchSample(op);
    if (!items.length) { console.log("  결과 없음"); continue; }

    const item = items[0];

    // 분류 관련 필드만 추출
    const classFields = [
      "pubPrcrmntLrgClsfcNm", "pubPrcrmntMidClsfcNm",
      "pubPrcrmntLrg", "pubPrcrmntMid",
      "pubPrcrmntClsfc", "pubPrcrmntClsfcNm",
      "ntceKindNm", "bidMethdNm",
      "srvceDivNm", "indutyCtgryNm",
      "indstrytyNm", "mainCnsttyNm",
      "cnstrtsiteRgnNm",
    ];

    console.log("\n[분류 관련 필드]");
    for (const f of classFields) {
      if (item[f] !== undefined) console.log(`  ${f}: "${item[f]}"`);
      else console.log(`  ${f}: [없음]`);
    }

    console.log("\n[전체 필드 목록]");
    console.log(" ", Object.keys(item).join(", "));
  }
})().catch(e => { console.error(e.message); process.exit(1); });

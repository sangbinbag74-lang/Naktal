/**
 * G2B 다른 API 존재 여부 probe (옵션 3)
 * - 단건 조회: getBidPblancListInfoCnstwkSpci 등
 * - 일별/일자별: 다른 inqryDiv
 * - 전체 통합: getBidPblancListInfoTotal 같은 게 있는지
 */
import * as path from "path";
import * as fs from "fs";

const rootEnv = path.resolve(__dirname, "../../../../.env");
const c = fs.readFileSync(rootEnv, "utf-8");
let key = "";
for (const l of c.split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "KONEPS_API_KEY" || (k === "G2B_API_KEY" && !key)) key = v;
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

const TARGETS = [
  // 단건 조회 후보
  { name: "getBidPblancListInfoCnstwkSpci",  params: "bidNtceNo=20240301008&bidNtceOrd=000&type=json" },
  { name: "getBidPblancListInfoServcSpci",   params: "bidNtceNo=20240301008&bidNtceOrd=000&type=json" },
  { name: "getBidPblancListInfoThngSpci",    params: "bidNtceNo=20240301008&bidNtceOrd=000&type=json" },
  { name: "getBidPblancListInfo",             params: "inqryDiv=1&inqryBgnDt=202403010000&inqryEndDt=202403012359&numOfRows=1&pageNo=1&type=json" },
  // inqryDiv 추가 시도
  { name: "getBidPblancListInfoCnstwk",       params: "inqryDiv=4&inqryBgnDt=202403010000&inqryEndDt=202403312359&numOfRows=1&pageNo=1&type=json" },
  { name: "getBidPblancListInfoCnstwk",       params: "inqryDiv=5&inqryBgnDt=202403010000&inqryEndDt=202403312359&numOfRows=1&pageNo=1&type=json" },
  { name: "getBidPblancListInfoCnstwk",       params: "inqryDiv=2&ntceInsttCd=A100002&inqryBgnDt=202403010000&inqryEndDt=202403312359&numOfRows=1&pageNo=1&type=json" },
  { name: "getBidPblancListInfoCnstwk",       params: "inqryDiv=2&dminsttCd=A100002&inqryBgnDt=202403010000&inqryEndDt=202403312359&numOfRows=1&pageNo=1&type=json" },
  { name: "getBidPblancListInfoCnstwk",       params: "inqryDiv=2&bidNtceNo=20240301008&numOfRows=1&pageNo=1&type=json" },
];

async function probe(name: string, params: string) {
  const url = `${BASE}/${name}?serviceKey=${encodeURIComponent(key)}&${params}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(t); } catch { /* not json */ }
    const code = parsed?.response?.header?.resultCode ?? parsed?.["nkoneps.com.response.ResponseError"]?.header?.resultCode ?? "??";
    const msg = parsed?.response?.header?.resultMsg ?? parsed?.["nkoneps.com.response.ResponseError"]?.header?.resultMsg ?? "?";
    const tc = parsed?.response?.body?.totalCount;
    return { name, params: params.slice(0, 80), http: r.status, code, msg, totalCount: tc, snippet: t.slice(0, 200) };
  } catch (e) {
    return { name, params: params.slice(0, 80), http: -1, code: "ERR", msg: String(e).slice(0, 80), totalCount: null, snippet: "" };
  }
}

(async () => {
  const results: any[] = [];
  for (const t of TARGETS) {
    const r = await probe(t.name, t.params);
    results.push(r);
    console.log(`${r.code.padStart(3)} | ${r.name.padEnd(35)} | ${r.params.slice(0,60)} | tc=${r.totalCount} | ${r.msg}`);
    await new Promise(r => setTimeout(r, 300));
  }
  const out = path.resolve(__dirname, "../../../../probe-g2b-other-apis-result.json");
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nJSON: ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });

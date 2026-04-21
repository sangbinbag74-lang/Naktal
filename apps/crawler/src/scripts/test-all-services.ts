/**
 * 5개 G2B 서비스 모두 확인 + A값 관련 필드 검색
 */
import * as path from "path";
import * as fs from "fs";
import * as https from "https";

function loadEnv(): { apiKey: string } {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const env: Record<string, string> = {};
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      env[k] = v;
    }
  } catch {}
  return { apiKey: env.KONEPS_API_KEY || env.G2B_API_KEY || process.env.KONEPS_API_KEY || "" };
}

function httpsGet(url: string, ms = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, ms);
    const req = https.get(url, (res) => {
      let body = "";
      res.on("data", (d: Buffer) => { body += d.toString(); });
      res.on("end", () => { clearTimeout(timer); resolve(body); });
      res.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

async function testOp(base: string, op: string, apiKey: string, extraParams: Record<string, string> = {}): Promise<{ok: boolean, count: number, keys: string[], aKeys: string[], err?: string}> {
  const url = new URL(`${base}/${op}`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("numOfRows", "5");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", "202604010000");
  url.searchParams.set("inqryEndDt", "202604152359");
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  try {
    const text = await httpsGet(url.toString());
    const json: any = JSON.parse(text);
    const code = json?.response?.header?.resultCode;
    if (code && code !== "00") return {ok: false, count: 0, keys: [], aKeys: [], err: `${code}:${json?.response?.header?.resultMsg}`};
    const cnt = json?.response?.body?.totalCount ?? 0;
    const items = json?.response?.body?.items;
    let first: any = null;
    if (Array.isArray(items) && items.length > 0) first = items[0];
    else if (items?.item) first = Array.isArray(items.item) ? items.item[0] : items.item;
    const keys = first ? Object.keys(first) : [];
    const aKeys = keys.filter(k =>
      /sfty|mngcst|insrprm|rtrfund|health|insurance|qlty|aval|avalue|aCalcl|bidPrceCalclA/i.test(k)
    );
    return {ok: true, count: cnt, keys, aKeys};
  } catch (e) {
    return {ok: false, count: 0, keys: [], aKeys: [], err: (e as Error).message.slice(0,80)};
  }
}

async function main() {
  const { apiKey } = loadEnv();
  if (!apiKey) { console.error("KONEPS_API_KEY 없음"); process.exit(1); }

  // 5개 서비스 base URL과 예상 operation
  const services = [
    {
      name: "입찰공고정보서비스 (15129394)",
      base: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
      ops: [
        "getBidPblancListInfoCnstwk",
        "getBidPblancListInfoServc",
        "getBidPblancListInfoThng",
        "getBidPblancListBidPrceCalclAInfo",
        "getBidPblancListInfoCnstwkBsisAmount",
      ]
    },
    {
      name: "낙찰정보서비스 (15129397)",
      base: "https://apis.data.go.kr/1230000/as/ScsbidInfoService",
      ops: [
        "getScsbidListSttusCnstwk",
        "getScsbidListSttusServc",
        "getScsbidListSttusThng",
        "getOpengResultListInfoCnstwk",
        "getOpengResultListInfoServc",
      ]
    },
    {
      name: "계약정보서비스 (15129427)",
      base: "https://apis.data.go.kr/1230000/ao/CntrctInfoService",
      ops: [
        "getCntrctInfoListSttusCnstwk",
        "getCntrctInfoListSttusServc",
        "getCntrctInfoListSttusThng",
        "getCntrctInfoListSttusFrgcpt",
      ]
    },
    {
      name: "사전규격정보서비스 (15129437)",
      base: "https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService",
      ops: [
        "getPublicPrcureThngInfoCnstwk",
        "getPublicPrcureThngInfoServc",
      ]
    },
    {
      name: "계약과정통합공개서비스 (15129459)",
      base: "https://apis.data.go.kr/1230000/ao/CntrctPblAllSrchInfoService",
      ops: [
        "getCntrctPblAllSrchListInfoCnstwk",
        "getCntrctPblAllSrchListInfoServc",
        "getCntrctPblAllSrchListInfoThng",
      ]
    },
    {
      name: "공공데이터개방표준서비스 (15058815)",
      base: "https://apis.data.go.kr/1230000/PubDataOpnStdService",
      ops: [
        "getDataSetOpnStdBidPblancInfo",
        "getDataSetOpnStdCntrctInfo",
      ]
    }
  ];

  console.log(`=== 5개+ G2B 서비스 A값 필드 검색 ===\n`);
  for (const svc of services) {
    console.log(`\n━━━ ${svc.name} ━━━`);
    console.log(`Base: ${svc.base}`);
    for (const op of svc.ops) {
      const r = await testOp(svc.base, op, apiKey);
      const status = r.ok ? "✅" : `❌(${r.err})`;
      console.log(`  ${status} ${op} | totalCount=${r.count} | A값필드=${r.aKeys.length > 0 ? r.aKeys.join(",") : "없음"}`);
      if (r.aKeys.length > 0) {
        console.log(`     🎯 전체키: ${r.keys.join(", ")}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

main().catch(console.error);

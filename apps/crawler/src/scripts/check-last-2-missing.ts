import * as fs from "fs"; import * as path from "path";

function loadEnv() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  const map: Record<string,string> = {};
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    const m = v.match(/^"([^"]*)"|^'([^']*)'/);
    if (m) v = m[1] ?? m[2];
    else { const hash = v.indexOf("#"); if (hash >= 0) v = v.slice(0, hash).trim(); }
    map[t.slice(0, i).trim()] = v;
  }
  return map;
}
const ENV = loadEnv();
const KEY = ENV.KONEPS_API_KEY || ENV.G2B_API_KEY;

const SCSBID_BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const OPS = ["getScsbidListSttusThng","getScsbidListSttusCnstwk","getScsbidListSttusServc","getScsbidListSttusFrgcpt"];
const TARGETS = ["20050503401", "R26BK01375929"];

async function tryFetch(annId: string, op: string): Promise<any | null> {
  const url = new URL(`${SCSBID_BASE}/${op}`);
  url.searchParams.set("serviceKey", KEY!);
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "2");
  url.searchParams.set("bidNtceNo", annId);
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
    const d: any = await res.json();
    if (!d?.response) return null;
    const items = d.response.body?.items;
    if (!items || items === "") return null;
    const arr = Array.isArray(items) ? items : (items.item ? (Array.isArray(items.item) ? items.item : [items.item]) : []);
    return arr.length ? arr : null;
  } catch (e: any) {
    return null;
  }
}

(async () => {
  for (const annId of TARGETS) {
    console.log(`\n=== ${annId} ===`);
    let found = false;
    for (const op of OPS) {
      const r = await tryFetch(annId, op);
      if (r) {
        console.log(`  [${op}] HIT ${r.length}건`);
        for (const it of r.slice(0, 3)) {
          console.log(`    bidNtceNo=${it.bidNtceNo}  rlOpengDt=${it.rlOpengDt}  opengDt=${it.opengDt}`);
        }
        found = true;
      } else {
        console.log(`  [${op}] no data`);
      }
    }
    if (!found) console.log(`  → API에 존재하지 않음 (G2B 미공개 또는 폐기 데이터)`);
  }
})();

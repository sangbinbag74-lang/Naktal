/**
 * 박상빈님 주장 검증 — G2B 에 어제(5/12) 마감 공고 결과 진짜 있는지
 */
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
function val(name: string): string {
  const line = env.split("\n").find(l => l.startsWith(name + "="));
  if (!line) return "";
  return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
}
const KEY = val("KONEPS_API_KEY") || val("G2B_API_KEY");

const TARGETS = [
  { koneps: "R26BK01502987", title: "소천면 5/12 마감" },
  { koneps: "R26BK01501795", title: "완산구 3권역 5/11 마감" },
  { koneps: "R26BK01504290", title: "완산구 5권역 5/11 마감" },
  { koneps: "R26BK01502317", title: "소천면 (다른 등록) 5/12 마감" },
];

const SCSBID_OPS = ["getScsbidListSttusCnstwk", "getScsbidListSttusServc", "getScsbidListSttusThng", "getScsbidListSttusFrgcpt"];
const OPENG_OPS = ["getOpengResultListInfoCnstwk", "getOpengResultListInfoServc", "getOpengResultListInfoThng"];

async function probe(koneps: string, op: string, base: string, inqryDiv?: string): Promise<{ rc: string; rmsg: string; matched: boolean; items: number; sample?: unknown }> {
  const params = new URLSearchParams({
    serviceKey: KEY,
    type: "json",
    inqryBgnDt: "202604010000",
    inqryEndDt: "202605132359",
    bidNtceNo: koneps,
    numOfRows: "100",
    pageNo: "1",
  });
  if (inqryDiv) params.set("inqryDiv", inqryDiv);
  const url = `${base}/${op}?${params.toString()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { rc: `HTTP${res.status}`, rmsg: "", matched: false, items: 0 };
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (data as any)?.response?.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const header = (data as any)?.response?.header;
    let items = body?.items ?? [];
    if (!Array.isArray(items)) items = items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = items.find((i: any) => i.bidNtceNo?.trim() === koneps);
    return { rc: header?.resultCode ?? "?", rmsg: header?.resultMsg ?? "", matched: !!m, items: items.length, sample: m };
  } catch (e) {
    return { rc: "ERR", rmsg: (e as Error).message, matched: false, items: 0 };
  }
}

(async () => {
  console.log(`KEY length=${KEY.length}\n`);
  for (const t of TARGETS) {
    console.log(`=== ${t.title} (${t.koneps}) ===`);
    for (const op of SCSBID_OPS) {
      const r = await probe(t.koneps, op, "https://apis.data.go.kr/1230000/as/ScsbidInfoService", "1");
      console.log(`  SCSBID ${op} inqryDiv=1: rc=${r.rc} items=${r.items} matched=${r.matched}`);
      if (r.matched) console.log(`    → 매칭됨!`, JSON.stringify(r.sample).slice(0, 300));
    }
    for (const op of OPENG_OPS) {
      const r = await probe(t.koneps, op, "https://apis.data.go.kr/1230000/as/ScsbidInfoService", "1");
      console.log(`  OpengResult ${op} inqryDiv=1: rc=${r.rc} items=${r.items} matched=${r.matched}`);
      if (r.matched) console.log(`    → 매칭됨!`, JSON.stringify(r.sample).slice(0, 300));
    }
    console.log();
  }
})();

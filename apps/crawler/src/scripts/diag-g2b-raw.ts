/**
 * G2B 응답 raw 확인 — 4건 매칭 실패 진짜 원인
 */
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
function val(name: string): string {
  const line = env.split("\n").find(l => l.startsWith(name + "="));
  return line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";
}
const KEY = val("KONEPS_API_KEY") || val("G2B_API_KEY");

const KONEPS = "R26BK01501795"; // 완산구 3권역 5/11 마감
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const OP = "getScsbidListSttusCnstwk";

const variants: { name: string; q: Record<string, string> }[] = [
  { name: "bidNtceNo + inqryDiv=1", q: { inqryDiv: "1", bidNtceNo: KONEPS } },
  { name: "bidNtceNo + inqryDiv=2", q: { inqryDiv: "2", bidNtceNo: KONEPS } },
  { name: "bidNtceNo only (no inqryDiv)", q: { bidNtceNo: KONEPS } },
  { name: "range only inqryDiv=1", q: { inqryDiv: "1", inqryBgnDt: "202605110000", inqryEndDt: "202605132359" } },
  { name: "range only inqryDiv=2", q: { inqryDiv: "2", inqryBgnDt: "202605110000", inqryEndDt: "202605132359" } },
];

(async () => {
  for (const v of variants) {
    const params = new URLSearchParams({
      serviceKey: KEY, type: "json",
      numOfRows: "5", pageNo: "1",
      ...v.q,
    });
    const url = `${BASE}/${OP}?${params.toString()}`;
    console.log(`\n=== ${v.name} ===`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      console.log(`HTTP ${res.status}, size=${text.length}`);
      console.log(text.slice(0, 800));
    } catch (e) {
      console.log("ERR:", (e as Error).message);
    }
  }
})();

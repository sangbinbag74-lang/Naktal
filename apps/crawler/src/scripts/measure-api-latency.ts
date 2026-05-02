import * as path from "path";
import * as fs from "fs";
function loadKey() {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (v && !/[가-힣]/.test(v) && k === "KONEPS_API_KEY") return v;
  }
  return "";
}
const KEY = loadKey();
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const OPS = [
  "getOpengResultListInfoCnstwkPreparPcDetail",
  "getOpengResultListInfoServcPreparPcDetail",
  "getOpengResultListInfoThngPreparPcDetail",
  "getOpengResultListInfoFrgcptPreparPcDetail",
];
async function f(op: string, page: number) {
  const t0 = Date.now();
  const url = new URL(`${BASE}/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("numOfRows", "999");
  url.searchParams.set("pageNo", String(page));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryBgnDt", "202404010000");
  url.searchParams.set("inqryEndDt", "202404302359");
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 120000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    await res.text();
    clearTimeout(tm);
    return { op, page, ms: Date.now()-t0, status: res.status };
  } catch (e) {
    clearTimeout(tm);
    return { op, page, ms: Date.now()-t0, err: (e as Error).message };
  }
}
function pct(arr: number[], p: number): number {
  const sorted = [...arr].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1, Math.floor(sorted.length * p / 100))];
}
(async () => {
  process.stdout.write("=== B측정: 4-op 병렬 × 30회 (현재 5인스턴스 가동 상태에서) ===\n");
  const all: number[] = [];
  const errs: string[] = [];
  const tStart = Date.now();
  for (let i = 1; i <= 30; i++) {
    const tBatch = Date.now();
    const rs = await Promise.all(OPS.map((op) => f(op, i)));
    for (const r of rs) {
      if ('err' in r) { errs.push(`${r.op} p${r.page}: ${r.err} (${r.ms}ms)`); }
      else { all.push(r.ms); }
    }
    const okCnt = rs.filter(r => !('err' in r)).length;
    const errCnt = rs.length - okCnt;
    process.stdout.write(`배치 ${i}/30: ${((Date.now()-tBatch)/1000).toFixed(1)}s, 성공 ${okCnt}/4 (${rs.map(r => 'err' in r ? `ERR/${r.ms}ms` : `${r.ms}ms`).join(", ")})\n`);
  }
  const elapsed = ((Date.now()-tStart)/1000).toFixed(1);
  process.stdout.write(`\n=== 총 ${elapsed}s, N=${all.length} 성공, 에러 ${errs.length} ===\n`);
  if (all.length > 0) {
    process.stdout.write(`P50=${pct(all,50)}ms P75=${pct(all,75)}ms P90=${pct(all,90)}ms P95=${pct(all,95)}ms P99=${pct(all,99)}ms MAX=${Math.max(...all)}ms\n`);
    process.stdout.write(`평균=${(all.reduce((a,b)=>a+b,0)/all.length).toFixed(0)}ms\n`);
  }
  if (errs.length > 0) {
    process.stdout.write(`\n에러 ${errs.length}개:\n`);
    for (const e of errs.slice(0, 10)) process.stdout.write(`  ${e}\n`);
  }
  process.stdout.write(`\n=== timeout 권장값 ===\n`);
  if (all.length > 0) {
    const p99 = pct(all, 99);
    const max = Math.max(...all);
    process.stdout.write(`P99 기준: ${p99}ms × 1.5 = ${Math.ceil(p99*1.5/1000)}s\n`);
    process.stdout.write(`MAX 기준: ${max}ms × 1.2 = ${Math.ceil(max*1.2/1000)}s (안전)\n`);
  }
})();

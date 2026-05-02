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
async function f(op: string, page: number, numRows: number) {
  const t0 = Date.now();
  const url = new URL(`${BASE}/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("numOfRows", String(numRows));
  url.searchParams.set("pageNo", String(page));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryBgnDt", "201202010000");
  url.searchParams.set("inqryEndDt", "201202292359");
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 60000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const text = await res.text();
    clearTimeout(tm);
    const j = JSON.parse(text);
    const it = j.response?.body?.items;
    const arr = Array.isArray(it) ? it : (it?.item ? (Array.isArray(it.item) ? it.item : [it.item]) : []);
    return { op, page, ms: Date.now()-t0, total: j.response?.body?.totalCount, n: arr.length };
  } catch (e) { clearTimeout(tm); return { op, page, ms: Date.now()-t0, err: (e as Error).message }; }
}
(async () => {
  process.stdout.write("=== 순차 PAGE_SIZE=999 ===\n");
  for (const p of [1, 2]) {
    const r = await f("getOpengResultListInfoCnstwkPreparPcDetail", p, 999);
    process.stdout.write(JSON.stringify(r) + "\n");
  }
  process.stdout.write("=== 병렬 4-op page1 PAGE_SIZE=999 ===\n");
  const t0 = Date.now();
  const ops = ["getOpengResultListInfoCnstwkPreparPcDetail","getOpengResultListInfoServcPreparPcDetail","getOpengResultListInfoThngPreparPcDetail","getOpengResultListInfoFrgcptPreparPcDetail"];
  const rs = await Promise.all(ops.map(o => f(o, 1, 999)));
  process.stdout.write(`총 ${Date.now()-t0}ms\n`);
  for (const r of rs) process.stdout.write(JSON.stringify(r) + "\n");
})();

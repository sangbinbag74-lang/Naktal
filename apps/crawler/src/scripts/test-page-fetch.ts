import * as path from "path";
import * as fs from "fs";
function loadKey(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (k === "KONEPS_API_KEY" || k === "G2B_API_KEY") return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
const KEY = loadKey();
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
async function fetchOne(page: number) {
  const t0 = Date.now();
  const url = new URL(`${BASE}/getOpengResultListInfoCnstwkPreparPcDetail`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("numOfRows", "500");
  url.searchParams.set("pageNo", String(page));
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryBgnDt", "201202010000");
  url.searchParams.set("inqryEndDt", "201202292359");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const text = await res.text();
    clearTimeout(timer);
    process.stdout.write(`page ${page}: ${res.status} ${text.length}b ${Date.now()-t0}ms\n`);
    if (text.length > 0) {
      const j = JSON.parse(text);
      const items = j.response?.body?.items?.item;
      const cnt = Array.isArray(items) ? items.length : items ? 1 : 0;
      const total = j.response?.body?.totalCount;
      process.stdout.write(`  totalCount=${total} items=${cnt}\n`);
    }
  } catch (e) {
    clearTimeout(timer);
    process.stdout.write(`page ${page}: ERROR ${(e as Error).message} ${Date.now()-t0}ms\n`);
  }
}
(async () => {
  for (const p of [1, 2, 3, 5, 10, 20, 50, 100, 200, 240, 241]) {
    await fetchOne(p);
  }
})();

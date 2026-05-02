import * as path from "path";
import * as fs from "fs";
function loadEnv() {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const env: Record<string, string> = {};
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (v && !/[가-힣]/.test(v)) env[k] = v;
  }
  return env;
}
const env = loadEnv();
const apiKey = env.KONEPS_API_KEY || env.G2B_API_KEY || "";
process.stdout.write(`Path: ${path.resolve(__dirname, "../../../../.env")}\n`);
process.stdout.write(`KONEPS_API_KEY len=${(env.KONEPS_API_KEY || "").length} prefix=${(env.KONEPS_API_KEY || "").slice(0, 30)}\n`);
process.stdout.write(`G2B_API_KEY len=${(env.G2B_API_KEY || "").length} prefix=${(env.G2B_API_KEY || "").slice(0, 30)}\n`);
process.stdout.write(`Used apiKey len=${apiKey.length}\n`);
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
async function fetchOne(page: number) {
  const t0 = Date.now();
  const url = new URL(`${BASE}/getOpengResultListInfoCnstwkPreparPcDetail`);
  url.searchParams.set("serviceKey", apiKey);
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
    process.stdout.write(`p${page}: ${res.status} ${text.length}b ${Date.now()-t0}ms\n`);
    if (res.status === 200 && text.length > 0) {
      const j = JSON.parse(text);
      const items = j.response?.body?.items?.item;
      const cnt = Array.isArray(items) ? items.length : items ? 1 : 0;
      process.stdout.write(`  total=${j.response?.body?.totalCount} items=${cnt}\n`);
    } else process.stdout.write(`  body: ${text.slice(0, 100)}\n`);
  } catch (e) {
    clearTimeout(timer);
    process.stdout.write(`p${page}: ERR ${(e as Error).message} ${Date.now()-t0}ms\n`);
  }
}
(async () => {
  for (const p of [1, 2, 5, 10, 50, 100, 200, 241]) await fetchOne(p);
})();

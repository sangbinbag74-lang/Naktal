import * as fs from "fs"; import * as path from "path";
function loadEnv() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  const map: Record<string,string> = {};
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return map;
}
const ENV = loadEnv();
const KEY = ENV.G2B_API_KEY || ENV.KONEPS_API_KEY || "";

(async () => {
  const url = new URL("https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusCnstwk");
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("numOfRows", "999");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", "202101010000");
  url.searchParams.set("inqryEndDt", "202101312359");
  console.log("URL:", url.toString().slice(0, 150) + "...");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  console.log("status:", res.status, res.statusText);
  console.log("content-length:", res.headers.get("content-length"));
  const txt = await res.text();
  console.log("body size:", txt.length);
  console.log("first 200 chars:", txt.slice(0, 200));
  try {
    const d = JSON.parse(txt);
    console.log("parsed OK. header:", d?.response?.header);
    console.log("totalCount:", d?.response?.body?.totalCount);
    const items = d?.response?.body?.items;
    console.log("items type:", Array.isArray(items) ? `array len=${items.length}` : typeof items);
    if (Array.isArray(items) && items[0]) {
      console.log("first item keys:", Object.keys(items[0]));
      console.log("first item rlOpengDt:", items[0].rlOpengDt, "bidNtceNo:", items[0].bidNtceNo);
    }
  } catch (e: any) {
    console.error("JSON parse FAILED:", e.message);
  }
})();

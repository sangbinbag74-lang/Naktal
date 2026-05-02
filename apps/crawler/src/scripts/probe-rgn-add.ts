/**
 * RgnLmtInfo + Add API 응답 필드 실측
 */
import * as path from "path";
import * as fs from "fs";

function loadKey(): string {
  const c = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
  let koneps = "", g2b = "";
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "KONEPS_API_KEY" && v && !/[가-힣]/.test(v)) koneps = v;
    else if (k === "G2B_API_KEY" && v && !/[가-힣]/.test(v)) g2b = v;
  }
  return koneps || g2b;
}
const KEY = loadKey();
const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

async function probe(op: string): Promise<void> {
  const url = new URL(`${BASE}/${op}`);
  url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("inqryBgnDt", "202403010000");
  url.searchParams.set("inqryEndDt", "202403012359");
  url.searchParams.set("numOfRows", "1");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  process.stdout.write(`\n=== ${op} ===\n`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    process.stdout.write(`HTTP ${res.status}\n`);
    if (!res.ok) { process.stdout.write(`${(await res.text()).slice(0,200)}\n`); return; }
    const j = await res.json() as { response?: { body?: { items?: unknown; totalCount?: number } } };
    const body = j?.response?.body;
    let items: unknown[] = [];
    if (Array.isArray(body?.items)) items = body.items as unknown[];
    else if ((body?.items as { item?: unknown })?.item) {
      const it = (body!.items as { item: unknown }).item;
      items = Array.isArray(it) ? (it as unknown[]) : [it];
    }
    process.stdout.write(`totalCount: ${body?.totalCount}\n`);
    if (items.length > 0) {
      const first = items[0] as Record<string, unknown>;
      process.stdout.write(`keys (${Object.keys(first).length}):\n  ${Object.keys(first).join(", ")}\n`);
      process.stdout.write(`샘플:\n${JSON.stringify(first, null, 2).slice(0, 1500)}\n`);
    }
  } catch (e) { process.stdout.write(`실패: ${(e as Error).message}\n`); }
}

(async () => {
  const ops = [
    "getBidPblancListInfoRgnLmtInfo",
    "getBidPblancListInfoRgnLmt",
    "getBidPblancListInfoAdd",
    "getBidPblancListInfoCnstwkAdd",
    "getBidPblancListInfoServcAdd",
    "getBidPblancListInfoThngAdd",
    "getBidPblancListInfoCnstwkRgnLmt",
    "getBidPblancListInfoServcRgnLmt",
    "getBidPblancListInfoThngRgnLmt",
    "getBidPblancListInfoCnstwkRgnLmtInfo",
    "getBidPblancListInfoServcRgnLmtInfo",
    "getBidPblancListInfoThngRgnLmtInfo",
  ];
  for (const op of ops) await probe(op);
})();

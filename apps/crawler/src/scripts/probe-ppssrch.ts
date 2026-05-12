/**
 * PPSSrch suffix endpoint + 민간낙찰정보서비스 + 조달데이터허브 probe.
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}

const KEY = process.env.KONEPS_API_KEY || process.env.G2B_API_KEY;
if (!KEY) { console.error("KONEPS_API_KEY missing"); process.exit(1); }

async function probe(url: string): Promise<{ status: number; body: string; ok: boolean }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    const ok = res.status === 200 && body.startsWith("{") && !body.includes("API not found") && !body.includes("error");
    return { status: res.status, body: body.slice(0, 1500), ok };
  } catch (e) {
    return { status: -1, body: (e as Error).message, ok: false };
  }
}

(async () => {
  // 1. *PPSSrch 4종 (단건 + bulk)
  const opsBase = ["getOpengResultListInfoCnstwk", "getOpengResultListInfoServc", "getOpengResultListInfoThng", "getOpengResultListInfoFrgcpt"];
  const testNo = "R26BK01423034";
  console.log("=".repeat(80));
  console.log("[1] *PPSSrch suffix probe (bulk inqryDiv=1)");
  for (const baseOp of opsBase) {
    const op = baseOp + "PPSSrch";
    const url = `https://apis.data.go.kr/1230000/as/ScsbidInfoService/${op}?serviceKey=${KEY}&pageNo=1&numOfRows=2&inqryDiv=1&inqryBgnDt=202604010000&inqryEndDt=202604152359&type=json`;
    const r = await probe(url);
    console.log(`\n${r.ok ? "✅" : "❌"} ${op}  HTTP=${r.status}`);
    if (r.ok) {
      try {
        const j = JSON.parse(r.body);
        const item = j.response?.body?.items?.[0];
        if (item) {
          console.log(`  fields (${Object.keys(item).length}): ${Object.keys(item).join(", ")}`);
          // bidPrcRank, prtcpt 키워드 있나?
          const intKeys = Object.keys(item).filter(k => /prtcpt|bidPrc|opengCorp|prc|rank|sucsfbid/i.test(k));
          if (intKeys.length > 0) {
            console.log(`  [핵심 키] ${intKeys.join(", ")}`);
            for (const k of intKeys) {
              console.log(`    ${k} = ${String(item[k] ?? "").slice(0, 100)}`);
            }
          }
        }
      } catch { console.log("  " + r.body.slice(0, 300)); }
    } else {
      console.log("  " + r.body.slice(0, 200));
    }
  }

  // 2. *PPSSrch 단건 (bidNtceNo로 조회)
  console.log("\n" + "=".repeat(80));
  console.log("[2] *PPSSrch 단건 (inqryDiv=2)");
  for (const baseOp of opsBase) {
    const op = baseOp + "PPSSrch";
    const url = `https://apis.data.go.kr/1230000/as/ScsbidInfoService/${op}?serviceKey=${KEY}&pageNo=1&numOfRows=100&inqryDiv=2&bidNtceNo=${testNo}&type=json`;
    const r = await probe(url);
    console.log(`\n${r.ok ? "✅" : "❌"} ${op}  HTTP=${r.status}`);
    if (r.ok) {
      try {
        const j = JSON.parse(r.body);
        const items = j.response?.body?.items ?? [];
        console.log(`  items count = ${items.length}`);
        if (items.length > 0) {
          console.log(`  fields: ${Object.keys(items[0]).join(", ")}`);
          // 첫 3개 row 사정율/투찰가 보기
          for (let i = 0; i < Math.min(3, items.length); i++) {
            console.log(`  row[${i}]: ${JSON.stringify(items[i]).slice(0, 200)}`);
          }
        }
      } catch { console.log("  " + r.body.slice(0, 300)); }
    } else {
      console.log("  " + r.body.slice(0, 200));
    }
  }

  // 3. 민간낙찰정보서비스 (data.go.kr/data/15058985)
  console.log("\n" + "=".repeat(80));
  console.log("[3] 민간낙찰정보서비스 (15058985)");
  const civilUrl = `https://apis.data.go.kr/1230000/CivilScsbidInfoService/getCivilScsbidListInfo?serviceKey=${KEY}&pageNo=1&numOfRows=2&inqryDiv=1&inqryBgnDt=20260401&inqryEndDt=20260415&type=json`;
  const r3 = await probe(civilUrl);
  console.log(`HTTP=${r3.status}`);
  console.log(r3.body.slice(0, 500));

  // 4. data.g2b.go.kr 조달데이터허브 — TODO: 별도 인증 필요할 가능성
})();

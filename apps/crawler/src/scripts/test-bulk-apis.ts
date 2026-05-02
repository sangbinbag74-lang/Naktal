/**
 * 5개 보조 API의 inqryDiv=1 (날짜 bulk) 가능 여부 실측
 * fill-subcategories.ts와 동일한 방식으로 호출.
 */
import * as path from "path";
import * as fs from "fs";

function loadEnv(): string {
  try {
    const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^KONEPS_API_KEY=(.*)$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  } catch {}
  for (const k of ["KONEPS_API_KEY", "G2B_API_KEY"]) {
    if (process.env[k]) return process.env[k] as string;
  }
  throw new Error("API key not found");
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

async function call(op: string, params: Record<string, string>): Promise<string> {
  const url = new URL(`${BASE}/${op}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const txt = await res.text();
  return `HTTP ${res.status}: ${txt.slice(0, 400)}`;
}

async function main() {
  const key = loadEnv();
  console.log(`API key loaded (length=${key.length})\n`);

  // 1. 기존 동작 확인: 단건 LicenseLimit
  console.log("=== 1. LicenseLimit 단건 (기존 fill-subcategories 방식) ===");
  console.log(await call("getBidPblancListInfoLicenseLimit", {
    serviceKey: key, inqryDiv: "2", bidNtceNo: "20230328647",
    bidNtceOrd: "000", numOfRows: "50", pageNo: "1", type: "json",
  }));
  console.log();

  // 2. 날짜 bulk 테스트 (inqryDiv=1) — 5개 API
  const ops = [
    "getBidPblancListInfoLicenseLimit",
    "getBidPblancListInfoCnstwkBsisAmount",
    "getBidPblancListInfoServcBsisAmount",
    "getBidPblancListInfoThngBsisAmount",
    "getBidPblancListBidPrceCalclAInfo",
  ];
  for (const op of ops) {
    console.log(`=== 2. ${op} inqryDiv=1 bulk ===`);
    console.log(await call(op, {
      serviceKey: key, inqryDiv: "1",
      inqryBgnDt: "202604010000", inqryEndDt: "202604012359",
      numOfRows: "10", pageNo: "1", type: "json",
    }));
    console.log();
  }

  // 3. 다른 엔드포인트 존재 확인
  const extras = [
    "getBidPblancListInfoRgnLmtInfo",
    "getBidPblancListInfoAdd",
    "getBidPblancListInfoChgHstry",
    "getBidPblancListInfoChgHstryCnstwk",
    "getBidPblancListInfoPreStdrd",
    "getBidPblancListInfoFrgcpt",
  ];
  for (const op of extras) {
    console.log(`=== 3. ${op} 존재 확인 ===`);
    console.log(await call(op, {
      serviceKey: key, inqryDiv: "1",
      inqryBgnDt: "202604010000", inqryEndDt: "202604012359",
      numOfRows: "5", pageNo: "1", type: "json",
    }));
    console.log();
  }
}

main().catch(console.error);

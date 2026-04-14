import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";

// .env 로드 (파일 없으면 process.env 폴백)
function loadEnv(): { url: string; key: string; apiKey: string } {
  let text = "";
  // tsx에서 __dirname이 "."로 나오는 이슈 → 여러 경로 순서대로 시도
  const candidates = [
    path.resolve(__dirname, "../../../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  try {
    for (const p of candidates) {
      if (fs.existsSync(p)) { text = fs.readFileSync(p, "utf8"); break; }
    }
  } catch {
    // GitHub Actions 등 파일 없는 환경 → process.env에서 직접 읽음
  }

  const get = (k: string) => {
    if (text) {
      for (const line of text.split("\n")) {
        if (line.startsWith(k + "=")) return line.slice(k.length + 1).replace(/^["']|["']\s*$/g, "").trim();
      }
    }
    return process.env[k] ?? "";
  };
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    key: get("SUPABASE_SERVICE_ROLE_KEY"),
    apiKey: get("KONEPS_API_KEY") || get("G2B_API_KEY"),
  };
}

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

interface BsisAmountItem {
  bssamt?: string;
  bidPrceCalclAYn?: string;
  rsrvtnPrceRngBgnRate?: string;  // 예비가격 범위 시작 (예: "-2")
  rsrvtnPrceRngEndRate?: string;  // 예비가격 범위 끝 (예: "+2")
}

interface AInfoItem {
  npnInsrprm?: string;
  mrfnHealthInsrprm?: string;
  rtrfundNon?: string;
  odsnLngtrmrcprInsrprm?: string;
  sftyMngcst?: string;
  qltyMngcst?: string;
  qltyMngcstAObjYn?: string;
}

/**
 * 기초금액 API → bssamt(기초금액), bidPrceCalclAYn(A값여부) 조회
 */
// Node.js 내장 fetch가 Windows에서 hang → https 모듈 직접 사용
function httpsGet(url: string, ms = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, ms);
    const req = https.get(url, (res) => {
      let body = "";
      res.on("data", (d: Buffer) => { body += d.toString(); });
      res.on("end", () => { clearTimeout(timer); resolve(body); });
      res.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

function safeJson<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { return null; }
}

async function fetchBsisAmount(bidNtceNo: string, apiKey: string): Promise<{ aValueYn: string; aValueAmt: bigint; priceRangeRate: string } | null> {
  const url = `${BASE}/getBidPblancListInfoCnstwkBsisAmount?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${bidNtceNo}&bidNtceOrd=000&numOfRows=1&pageNo=1&type=json`;
  const text = await httpsGet(url);
  const json = safeJson<{ response?: { body?: { items?: BsisAmountItem[] } } }>(text);
  const items = json?.response?.body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return null;

  const item = items[0];
  const aValueYn = item.bidPrceCalclAYn ?? "";
  const aValueAmt = BigInt(item.bssamt ? Math.round(Number(item.bssamt)) : 0);
  const bgn = item.rsrvtnPrceRngBgnRate ?? "";
  const end = item.rsrvtnPrceRngEndRate ?? "";
  const priceRangeRate = bgn && end ? `${bgn}~${end}` : "";
  return { aValueYn, aValueAmt, priceRangeRate };
}

/**
 * A값 정보 API → A합산(국민연금 + 건강보험 + 퇴직공제부금 + 산재보험 + 안전관리비 + 품질관리비) 조회
 */
async function fetchATotal(bidNtceNo: string, apiKey: string): Promise<bigint> {
  const url = `${BASE}/getBidPblancListBidPrceCalclAInfo?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${bidNtceNo}&bidNtceOrd=000&numOfRows=1&pageNo=1&type=json`;
  const text = await httpsGet(url);
  const json = safeJson<{ response?: { body?: { items?: AInfoItem[] } } }>(text);
  const items = json?.response?.body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return 0n;

  const item = items[0];
  const sum =
    Number(item.npnInsrprm ?? 0) +
    Number(item.mrfnHealthInsrprm ?? 0) +
    Number(item.rtrfundNon ?? 0) +
    Number(item.odsnLngtrmrcprInsrprm ?? 0) +
    Number(item.sftyMngcst ?? 0) +
    (item.qltyMngcstAObjYn === "Y" ? Number(item.qltyMngcst ?? 0) : 0);
  return BigInt(Math.round(sum));
}

export async function fillAValue() {
  const { url, key, apiKey } = loadEnv();
  const sb = createClient(url, key);
  const now = new Date().toISOString();

  // 진행중 시설공사 공고 전체 페이징 조회
  const all: { id: string; konepsId: string; aValueYn: string; aValueTotal: string; priceRangeRate: string }[] = [];
  let page = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("Announcement")
      .select("id,konepsId,aValueYn,aValueTotal,priceRangeRate")
      .not("category", "in", '("물품","용역","기타")')
      .gte("deadline", now)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) { console.error("조회 실패:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    page++;
  }

  // 처리 대상: aValueYn 미채워진 것 + aValueYn=Y이지만 aValueTotal=0인 것 + priceRangeRate 미채워진 것
  const list = all.filter(a =>
    !a.aValueYn ||
    !a.priceRangeRate ||
    (a.aValueYn === "Y" && (!a.aValueTotal || a.aValueTotal === "0"))
  );
  console.log(`진행중 공사 공고: ${all.length}건 | 처리 대상: ${list.length}건`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < list.length; i++) {
    const ann = list[i];
    try {
      let aValueYn = ann.aValueYn;
      let aValueAmt = 0n;
      let aValueTotal = 0n;

      // aValueYn 미채워진 경우 → 기초금액 API 호출
      let priceRangeRate = ann.priceRangeRate ?? "";
      if (!aValueYn || !priceRangeRate) {
        const bsisResult = await fetchBsisAmount(ann.konepsId, apiKey);
        if (!bsisResult) { skipped++; continue; }
        aValueYn = bsisResult.aValueYn;
        aValueAmt = bsisResult.aValueAmt;
        priceRangeRate = bsisResult.priceRangeRate;
      }

      // A값 대상 공고 → A합산 API 추가 호출
      if (aValueYn === "Y") {
        aValueTotal = await fetchATotal(ann.konepsId, apiKey);
        await new Promise(r => setTimeout(r, 120)); // 추가 딜레이
      }

      const updatePayload: Record<string, string> = { aValueYn };
      if (aValueAmt > 0n) updatePayload.aValueAmt = aValueAmt.toString();
      if (aValueTotal > 0n) updatePayload.aValueTotal = aValueTotal.toString();
      if (priceRangeRate) updatePayload.priceRangeRate = priceRangeRate;

      await sb.from("Announcement").update(updatePayload).eq("id", ann.id);
      updated++;

      if ((i + 1) % 50 === 0) {
        console.log(`${i + 1}/${list.length} | 업데이트: ${updated}건 | 스킵: ${skipped}건 | 실패: ${failed}건`);
      }

      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      if (failed < 3) console.error(`[${ann.konepsId}] 오류:`, (e as Error).message);
      failed++;
    }
  }

  console.log(`\n완료: ${updated}건 업데이트 / ${skipped}건 스킵(데이터없음) / ${failed}건 실패`);
}

// 직접 실행 시에만 진입
if (require.main === module) {
  fillAValue().catch(console.error);
}

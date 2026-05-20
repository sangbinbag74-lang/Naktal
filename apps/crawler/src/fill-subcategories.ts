import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// .env 로드 (파일 없으면 process.env 폴백)
function loadEnv(): { url: string; key: string; apiKey: string } {
  let text = "";
  try {
    const envPath = path.resolve(__dirname, "../../../.env");
    text = fs.readFileSync(envPath, "utf8");
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

/**
 * 면허제한정보 API로 업종(부종) 목록 조회
 * indstrytyMfrcFldList: "[1^조경식재공사][2^전문건설공사]" 형태 파싱
 */
async function fetchLicenseLimit(bidNtceNo: string, apiKey: string): Promise<string[]> {
  const url = `${BASE}/getBidPblancListInfoLicenseLimit?serviceKey=${apiKey}&inqryDiv=2&bidNtceNo=${bidNtceNo}&bidNtceOrd=000&numOfRows=50&pageNo=1&type=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const json = await res.json() as { response?: { body?: { items?: Array<{
    indstrytyMfrcFldList?: string;
    permsnIndstrytyList?: string;
    lcnsLmtNm?: string;
  }> } } };
  const items = json?.response?.body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return [];

  const result = new Set<string>();
  for (const item of items) {
    // 박상빈님 5/20 D-3 명시 — 5/5 표본 실측: lcnsLmtNm 100% 채움, indstrytyMfrcFldList 60%, permsnIndstrytyList 20%.
    // INCIDENT-2026-04-24 3.5 사건 재발 (permsnIndstrytyList 미파싱). 3개 키 전수 파싱.

    // 1. indstrytyMfrcFldList: "[1^조경식재공사][2^전문건설공사]" 형식
    const indst = item.indstrytyMfrcFldList ?? "";
    for (const m of indst.matchAll(/\[\d+\^([^\]]+)\]/g)) {
      const name = m[1].trim();
      if (name) result.add(name);
    }
    // 2. permsnIndstrytyList: 동일 형식
    const permsn = item.permsnIndstrytyList ?? "";
    for (const m of permsn.matchAll(/\[\d+\^([^\]]+)\]/g)) {
      const name = m[1].trim();
      if (name) result.add(name);
    }
    // 3. lcnsLmtNm: "조경식재ㆍ시설물공사업/4993" 또는 ", " 구분 다건 → 업종명만 추출 (코드 제거)
    const lcns = item.lcnsLmtNm ?? "";
    for (const part of lcns.split(/[,，;]/)) {
      const name = part.split("/")[0].trim();
      if (name) result.add(name);
    }
  }
  return Array.from(result);
}

export async function fillSubCategories() {
  const { url, key, apiKey } = loadEnv();
  const sb = createClient(url, key);
  const now = new Date().toISOString();

  // 진행중 시설공사 공고 전체 페이징 조회
  const all: { id: string; konepsId: string; subCategories: string[] }[] = [];
  let page = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("Announcement")
      .select("id,konepsId,subCategories")
      .eq("category", "시설공사")
      .gte("deadline", now)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) { console.error("조회 실패:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    page++;
  }

  const list = all.filter(a => !a.subCategories || a.subCategories.length === 0);
  console.log(`진행중 시설공사: ${all.length}건 | 부종 미채워진 것: ${list.length}건`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < list.length; i++) {
    const ann = list[i];
    try {
      const subCategories = await fetchLicenseLimit(ann.konepsId, apiKey);
      if (subCategories.length === 0) { skipped++; continue; }

      await sb.from("Announcement").update({ subCategories }).eq("id", ann.id);
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

  console.log(`\n완료: ${updated}건 업데이트 / ${skipped}건 스킵(부종없음) / ${failed}건 실패`);
}

// 직접 실행 시에만 진입 (index.ts에서 import할 때 이중 실행 방지)
if (require.main === module) {
  fillSubCategories().catch(console.error);
}

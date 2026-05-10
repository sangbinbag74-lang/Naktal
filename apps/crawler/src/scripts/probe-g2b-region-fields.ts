/**
 * G2B getBidPblancListInfoCnstwk 1건 호출해 우리 DB에 없는 지역 관련 필드 찾기
 */
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const key = env.split("\n").find(l => l.startsWith("KONEPS_API_KEY="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  // 최근 1주일 공고 5건
  const today = new Date();
  const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const to = yyyymmdd(today) + "2359";
  const from = yyyymmdd(new Date(today.getTime() - 7 * 86400000)) + "0000";

  const url = `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk?serviceKey=${key}&inqryDiv=1&inqryBgnDt=${from}&inqryEndDt=${to}&numOfRows=5&pageNo=1&type=json`;

  console.log("URL:", url.slice(0, 130) + "...");
  const res = await fetch(url);
  const j = await res.json() as { response?: { body?: { items?: unknown } } };
  const items = j?.response?.body?.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.log("응답 없음:", JSON.stringify(j).slice(0, 500));
    return;
  }

  console.log(`\n=== 첫 공고 — 지역/참여 관련 필드만 ===`);
  const item = items[0] as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  for (const k of keys) {
    const v = item[k];
    if (typeof v !== "string") continue;
    const lk = k.toLowerCase();
    if (lk.includes("rgn") || lk.includes("lmt") || lk.includes("prtcpt") || lk.includes("locplc") || lk.includes("jntcontrct") || lk.includes("incntv") || lk.includes("instt") || lk.includes("ntce") || lk.includes("indstryty")) {
      console.log("  ", k.padEnd(35), "=", JSON.stringify(v));
    }
  }

  console.log(`\n=== 모든 필드 키 (가나다 정렬, 우리 DB 누락 가능 필드 식별용) ===`);
  for (const k of keys) console.log(" ", k);

  console.log(`\n=== 같은 공고 우리 DB rawJson 키 (참고) ===`);
  console.log(" 추후 직접 비교 — 이 응답의 모든 키와 우리 DB 키 셋트 비교");
})().catch(e => { console.error(e); process.exit(1); });

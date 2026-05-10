/**
 * G2B 보조 API 들이 지역/자격 관련 필드를 주는지 확인
 * - getBidPblancListInfoLicenseLimit (면허제한)
 * - getBidPblancListInfoCnstwkBsisAmount (공사 기초금액)
 * 사용자 공고: R26BK01510308 (가로수 결주지 보식사업, 완주군)
 */
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const key = env.split("\n").find(l => l.startsWith("KONEPS_API_KEY="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

(async () => {
  const ops = [
    "getBidPblancListInfoLicenseLimit",
    "getBidPblancListInfoCnstwkBsisAmount",
    "getBidPblancListBidPrceCalclAInfo",
  ];
  // 가로수 보식사업: 등록 2026-05-04, 마감 2026-05-14
  const from = "202605030000";
  const to   = "202605142359";
  for (const op of ops) {
    const url = `${BASE}/${op}?serviceKey=${key}&inqryDiv=1&inqryBgnDt=${from}&inqryEndDt=${to}&numOfRows=999&pageNo=1&type=json`;
    try {
      const res = await fetch(url);
      const j = await res.json() as { response?: { body?: { items?: unknown[] } } };
      const items = j?.response?.body?.items ?? [];
      console.log(`\n=== ${op} (${Array.isArray(items) ? items.length : "ERR"}건) ===`);
      // R26BK01510308 매칭만
      const target = (Array.isArray(items) ? items : []).find((x: unknown) => {
        const xx = x as { bidNtceNo?: string };
        return xx.bidNtceNo === "R26BK01510308";
      }) as Record<string, unknown> | undefined;
      if (!target) {
        console.log("  R26BK01510308 매칭 없음. 첫 1건 키만 보여드립니다:");
        const first = (Array.isArray(items) ? items[0] : null) as Record<string, unknown> | null;
        if (first) {
          for (const k of Object.keys(first).sort()) console.log("   ", k);
        }
        continue;
      }
      console.log("  bidNtceNo 매칭. 모든 필드:");
      for (const k of Object.keys(target).sort()) {
        const v = target[k];
        if (typeof v === "string" && v.length > 0) console.log("   ", k.padEnd(35), "=", JSON.stringify(v));
      }
    } catch (e) {
      console.log(`  ${op} 에러:`, (e as Error).message);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });

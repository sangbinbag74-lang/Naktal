/**
 * G2B API 직접 호출 - 3개 엔드포인트 분류 필드 실제 확인
 */
import { fetchAnnouncementPage, NTCE_OPS } from "./src/fetchers/g2b-client";

const LABELS: Record<string, string> = {
  getBidPblancListInfoCnstwk: "공사(Cnstwk)",
  getBidPblancListInfoServc:  "용역(Servc)",
  getBidPblancListInfoThng:   "물품(Thng)",
};

const CLASS_FIELDS = [
  "pubPrcrmntLrgClsfcNm", "pubPrcrmntMidClsfcNm",
  "pubPrcrmntLrg", "pubPrcrmntMid", "pubPrcrmntClsfc",
  "ntceKindNm", "srvceDivNm", "indutyCtgryNm",
  "indstrytyNm", "mainCnsttyNm", "bidMethdNm",
];

(async () => {
  for (const op of NTCE_OPS) {
    console.log("\n" + "=".repeat(60));
    console.log(`엔드포인트: ${LABELS[op]} (${op})`);
    console.log("=".repeat(60));

    const { items } = await fetchAnnouncementPage({
      pageNo: 1,
      numOfRows: 5,
      inqryDiv: "1",
      inqryBgnDt: "202504010000",
      inqryEndDt: "202504042359",
      operation: op,
    });

    if (!items.length) { console.log("  결과 없음"); continue; }

    // 최대 2건 샘플
    for (let idx = 0; idx < Math.min(2, items.length); idx++) {
      const item = items[idx];
      console.log(`\n[샘플 ${idx + 1}] bidNtceNo: ${item.bidNtceNo} / title: ${(item.bidNtceNm || "").slice(0, 30)}`);
      console.log("  분류 필드:");
      for (const f of CLASS_FIELDS) {
        const v = (item as any)[f];
        console.log(`    ${f}: ${v === undefined ? "[없음]" : v === null ? "null" : `"${v}"`}`);
      }
    }

    // 전체 필드 목록
    const allKeys = Object.keys(items[0]).sort();
    console.log("\n  전체 필드 목록:");
    console.log("  " + allKeys.join(", "));
  }
})().catch(e => { console.error(e.message); process.exit(1); });

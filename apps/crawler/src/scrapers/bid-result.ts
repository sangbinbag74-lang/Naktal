import { chromium } from "playwright";
import { parseBidResultRow, type BidResultRow } from "../parsers/bid-result";
import { randomDelay } from "../utils/delay";
import { logger } from "../utils/logger";

// ─── 나라장터 낙찰 결과 셀렉터 상수 ──────────────────────────────────────────
// ⚠️ 나라장터 사이트 구조 변경 시 이 상수만 업데이트하면 됩니다.
const SELECTORS = {
  // 낙찰 결과 목록 URL
  LIST_URL: "https://www.g2b.go.kr/pt/menu/selectSubFrame.do?framesrc=/pt/menu/frameBidPrceInfLst.do",

  // 낙찰 결과 테이블 행
  TABLE_ROWS: "#container table tbody tr",
  TABLE_CELLS: "td",

  // 다음 페이지
  NEXT_PAGE: (page: number) => `a[href*="pageIndex=${page}"], button[onclick*="${page}"]`,

  // 로딩 완료 대기
  WAIT_FOR: "#container table",

  // iframe src
  IFRAME_SRC: "/pt/menu/frameBidPrceInfLst.do",
} as const;

export async function scrapeBidResults(
  maxPages: number
): Promise<BidResultRow[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });
  const page = await context.newPage();

  const results: BidResultRow[] = [];
  const errors: string[] = [];

  try {
    logger.info(`낙찰 결과 크롤링 시작 (최대 ${maxPages}페이지)`);

    await page.goto(SELECTORS.LIST_URL, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    const frames = page.frames();
    const targetFrame =
      frames.find((f) => f.url().includes(SELECTORS.IFRAME_SRC)) ?? page;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      logger.info(`페이지 ${pageNum}/${maxPages} 수집 중...`);

      try {
        await targetFrame.waitForSelector(SELECTORS.WAIT_FOR, {
          timeout: 15_000,
        });

        const rows = await targetFrame.$$eval(
          SELECTORS.TABLE_ROWS,
          (trs) =>
            trs.map((tr) =>
              Array.from(tr.querySelectorAll("td")).map(
                (td) => (td as any).innerText?.trim() ?? ""
              )
            )
        );

        for (const cells of rows) {
          if (cells.length < 4) continue;
          const row = parseBidResultRow(cells);
          if (row) {
            results.push(row);
          } else {
            errors.push(`파싱 실패: [${cells.join("|")}]`);
          }
        }

        logger.info(`페이지 ${pageNum}: ${rows.length}행 수집 (누적 ${results.length}건)`);

        if (pageNum >= maxPages) break;

        const nextBtn = await targetFrame.$(SELECTORS.NEXT_PAGE(pageNum + 1));
        if (!nextBtn) {
          logger.info("다음 페이지 버튼 없음, 수집 종료");
          break;
        }
        await nextBtn.click();
        await randomDelay(2000, 3500);
      } catch (err) {
        logger.error(`페이지 ${pageNum} 수집 실패`, err);
        errors.push(`page_${pageNum}: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    logger.warn(`파싱 오류 ${errors.length}건:\n${errors.slice(0, 10).join("\n")}`);
  }

  logger.info(`낙찰 결과 수집 완료: 총 ${results.length}건`);
  return results;
}

import { chromium } from "playwright";
import { parseAnnouncementRow, type AnnouncementRow } from "../parsers/announcement";
import { randomDelay } from "../utils/delay";
import { logger } from "../utils/logger";

// ─── 나라장터 CSS 셀렉터 상수 ─────────────────────────────────────────────────
// ⚠️ 나라장터 사이트 구조 변경 시 이 상수만 업데이트하면 됩니다.
const SELECTORS = {
  // 공고 목록 진입 URL (입찰공고 목록)
  LIST_URL: "https://www.g2b.go.kr/pt/menu/selectSubFrame.do?framesrc=/pt/menu/frameBidPbancLst.do",

  // 공고 목록 테이블 행 (tbody 내 tr)
  TABLE_ROWS: "#container table tbody tr",

  // 행 내 각 셀
  TABLE_CELLS: "td",

  // 다음 페이지 버튼 (페이지 번호 링크)
  NEXT_PAGE: (page: number) => `a[href*="pageIndex=${page}"], button[onclick*="${page}"]`,

  // 로딩 완료 대기 대상
  WAIT_FOR: "#container table",

  // iframe ID (있는 경우)
  IFRAME_SRC: "/pt/menu/frameBidPbancLst.do",
} as const;

export async function scrapeAnnouncements(
  maxPages: number
): Promise<AnnouncementRow[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });
  const page = await context.newPage();

  const results: AnnouncementRow[] = [];
  const errors: string[] = [];

  try {
    logger.info(`공고 목록 크롤링 시작 (최대 ${maxPages}페이지)`);

    await page.goto(SELECTORS.LIST_URL, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // 나라장터는 iframe 구조를 사용할 수 있음
    const frames = page.frames();
    const targetFrame =
      frames.find((f) => f.url().includes(SELECTORS.IFRAME_SRC)) ?? page;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      logger.info(`페이지 ${pageNum}/${maxPages} 수집 중...`);

      try {
        // 테이블 로딩 대기
        await targetFrame.waitForSelector(SELECTORS.WAIT_FOR, {
          timeout: 15_000,
        });

        // 모든 행 수집
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
          if (cells.length < 5) continue;
          const row = parseAnnouncementRow(cells);
          if (row) {
            results.push(row);
          } else {
            errors.push(`파싱 실패: [${cells.join("|")}]`);
          }
        }

        logger.info(`페이지 ${pageNum}: ${rows.length}행 수집 (누적 ${results.length}건)`);

        // 마지막 페이지면 종료
        if (pageNum >= maxPages) break;

        // 다음 페이지로 이동
        const nextPage = pageNum + 1;
        const nextBtn = await targetFrame.$(SELECTORS.NEXT_PAGE(nextPage));
        if (!nextBtn) {
          logger.info("다음 페이지 버튼 없음, 수집 종료");
          break;
        }
        await nextBtn.click();

        // 서버 부하 방지 딜레이
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

  logger.info(`공고 수집 완료: 총 ${results.length}건`);
  return results;
}

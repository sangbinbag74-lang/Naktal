import * as path from "path";
import * as dotenv from "fs";

// .env.local 파일 직접 로드 (apps/web/.env.local 참조)
loadEnv();

import { scrapeAnnouncements } from "./scrapers/announcement";
import { scrapeBidResults } from "./scrapers/bid-result";
import {
  upsertAnnouncement,
  upsertBidResult,
  logCrawl,
} from "./db/upsert";
import { logger } from "./utils/logger";

// ─── .env.local 수동 로드 ────────────────────────────────────────────────────
function loadEnv(): void {
  const envPath = path.resolve(__dirname, "../../web/.env.local");
  try {
    const content = require("fs").readFileSync(envPath, "utf-8") as string;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env.local이 없으면 환경변수에서 직접 읽음
  }
}

// ─── CLI 인수 파싱 ───────────────────────────────────────────────────────────
function parseArgs(): { type: "announcement" | "bid-result" | "all"; pages: number } {
  const args = process.argv.slice(2);
  let type: "announcement" | "bid-result" | "all" = "all";
  let pages = 5;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) {
      const t = args[i + 1];
      if (t === "announcement" || t === "bid-result" || t === "all") {
        type = t;
      }
    }
    if (args[i] === "--pages" && args[i + 1]) {
      const p = parseInt(args[i + 1], 10);
      if (!isNaN(p) && p > 0) pages = p;
    }
  }
  return { type, pages };
}

// ─── 공고 크롤 실행 ───────────────────────────────────────────────────────────
async function runAnnouncementCrawl(pages: number): Promise<void> {
  logger.info("=== 공고 크롤 시작 ===");
  let count = 0;
  const errorMsgs: string[] = [];

  const rows = await scrapeAnnouncements(pages);

  for (const row of rows) {
    try {
      await upsertAnnouncement(row);
      count++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`upsert 실패: ${row.konepsId}`, err);
      errorMsgs.push(msg);
    }
  }

  const status =
    errorMsgs.length === 0
      ? "SUCCESS"
      : count > 0
      ? "PARTIAL"
      : "FAILED";

  await logCrawl({
    type: "ANNOUNCEMENT",
    status,
    count,
    errors: errorMsgs.length > 0 ? errorMsgs.slice(0, 20).join("\n") : undefined,
  });

  logger.info(`=== 공고 크롤 완료: ${count}건 저장, 오류 ${errorMsgs.length}건 ===`);
}

// ─── 낙찰 결과 크롤 실행 ──────────────────────────────────────────────────────
async function runBidResultCrawl(pages: number): Promise<void> {
  logger.info("=== 낙찰 결과 크롤 시작 ===");
  let count = 0;
  const errorMsgs: string[] = [];

  const rows = await scrapeBidResults(pages);

  for (const row of rows) {
    try {
      await upsertBidResult(row);
      count++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`upsert 실패: ${row.annId}`, err);
      errorMsgs.push(msg);
    }
  }

  const status =
    errorMsgs.length === 0
      ? "SUCCESS"
      : count > 0
      ? "PARTIAL"
      : "FAILED";

  await logCrawl({
    type: "BID_RESULT",
    status,
    count,
    errors: errorMsgs.length > 0 ? errorMsgs.slice(0, 20).join("\n") : undefined,
  });

  logger.info(`=== 낙찰 결과 크롤 완료: ${count}건 저장, 오류 ${errorMsgs.length}건 ===`);
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { type, pages } = parseArgs();
  logger.info(`크롤 타입: ${type}, 페이지 수: ${pages}`);

  try {
    if (type === "announcement" || type === "all") {
      await runAnnouncementCrawl(pages);
    }
    if (type === "bid-result" || type === "all") {
      await runBidResultCrawl(pages);
    }
  } catch (err) {
    logger.error("크롤러 치명적 오류", err);
    process.exit(1);
  }
}

main();

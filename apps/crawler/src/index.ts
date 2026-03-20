import * as path from "path";

// .env.local 파일 직접 로드 (apps/web/.env.local 참조)
loadEnv();

import { fetchAnnouncements } from "./fetchers/g2b-announcement";
import { fetchBidResults } from "./fetchers/g2b-bid-result";
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
interface CliArgs {
  type: "announcement" | "bid-result" | "all";
  pages: number;
  from?: string; // YYYYMMDD — 과거 데이터 수집 시작일
  to?: string;   // YYYYMMDD — 종료일 (기본: 오늘)
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let type: CliArgs["type"] = "all";
  let pages = 5;
  let from: string | undefined;
  let to: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) {
      const t = args[i + 1];
      if (t === "announcement" || t === "bid-result" || t === "all") type = t;
    }
    if (args[i] === "--pages" && args[i + 1]) {
      const p = parseInt(args[i + 1], 10);
      if (!isNaN(p) && p > 0) pages = p;
    }
    if (args[i] === "--from" && args[i + 1]) from = args[i + 1]; // YYYYMMDD
    if (args[i] === "--to"   && args[i + 1]) to   = args[i + 1]; // YYYYMMDD
  }

  return { type, pages, from, to };
}

// ─── 공고 수집 ────────────────────────────────────────────────────────────────
async function runAnnouncementCrawl(args: CliArgs): Promise<void> {
  logger.info("=== G2B 공고 수집 시작 ===");
  let count = 0;
  const errorMsgs: string[] = [];

  const rows = await fetchAnnouncements({
    fromDate: args.from,
    toDate: args.to,
    numOfRows: 100,
    maxPages: args.pages,
  });

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

  const status = errorMsgs.length === 0 ? "SUCCESS" : count > 0 ? "PARTIAL" : "FAILED";
  await logCrawl({ type: "ANNOUNCEMENT", status, count, errors: errorMsgs.slice(0, 20).join("\n") || undefined });
  logger.info(`=== 공고 수집 완료: ${count}건 저장, 오류 ${errorMsgs.length}건 ===`);
}

// ─── 낙찰결과 수집 ───────────────────────────────────────────────────────────
async function runBidResultCrawl(args: CliArgs): Promise<void> {
  logger.info("=== G2B 낙찰결과 수집 시작 ===");
  let count = 0;
  const errorMsgs: string[] = [];

  const rows = await fetchBidResults({
    fromDate: args.from,
    toDate: args.to,
    numOfRows: 100,
    maxPages: args.pages,
  });

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

  const status = errorMsgs.length === 0 ? "SUCCESS" : count > 0 ? "PARTIAL" : "FAILED";
  await logCrawl({ type: "BID_RESULT", status, count, errors: errorMsgs.slice(0, 20).join("\n") || undefined });
  logger.info(`=== 낙찰결과 수집 완료: ${count}건 저장, 오류 ${errorMsgs.length}건 ===`);
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  logger.info(`수집 타입: ${args.type}, 최대 페이지: ${args.pages}${args.from ? `, 기간: ${args.from}~${args.to ?? "오늘"}` : ""}`);

  try {
    if (args.type === "announcement" || args.type === "all") {
      await runAnnouncementCrawl(args);
    }
    if (args.type === "bid-result" || args.type === "all") {
      await runBidResultCrawl(args);
    }
  } catch (err) {
    logger.error("수집 치명적 오류", err);
    process.exit(1);
  }
}

main();

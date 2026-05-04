/**
 * 나라장터 G2B 전체 역대 데이터 일괄 수집
 * 2012-01 ~ 현재월까지 모든 공고·낙찰결과를 수집해 Supabase에 저장
 *
 * 실행: ts-node src/bulk-import.ts [--from 201201] [--to 202501]
 * GitHub Actions에서 자동 실행됨 (workflow_dispatch)
 */

import * as path from "path";
loadEnv();

import { fetchAnnouncements } from "./fetchers/g2b-announcement";
import { fetchBidResults } from "./fetchers/g2b-bid-result";
import { upsertAnnouncementBatch, upsertBidResultBatch, loadBulkCursor, saveBulkCursor } from "./db/upsert";
import { G2BCode07Error } from "./fetchers/g2b-client";
import { logger } from "./utils/logger";

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
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch { /* GitHub Actions에서는 환경변수 직접 주입 */ }
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** 현재 월 YYYYMM */
function currentYM(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** YYYYMM → 해당 월 마지막날 YYYYMMDD */
function lastDay(ym: string): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  const last = new Date(y, m, 0).getDate();
  return `${ym}${String(last).padStart(2, "0")}`;
}

/** YYYYMM을 n개월 이동 */
function addMonths(ym: string, n: number): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6)) + n - 1;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** CLI 인수 파싱 */
function parseArgs(): { from: string; to: string; skipBid: boolean; skipAnn: boolean } {
  const args = process.argv.slice(2);
  let from = "201201";
  let to   = currentYM();
  let skipBid = false;
  let skipAnn = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from"     && args[i + 1]) from = args[i + 1];
    if (args[i] === "--to"       && args[i + 1]) to   = args[i + 1];
    if (args[i] === "--skip-bid") skipBid = true;
    if (args[i] === "--skip-ann") skipAnn = true;
  }
  return { from, to, skipBid, skipAnn };
}

// ─── 월별 수집 ────────────────────────────────────────────────────────────────

async function importMonth(
  ym: string,
  opts: { skipBid: boolean; skipAnn: boolean }
): Promise<{ ann: number; bid: number }> {
  const fromDate = `${ym}01`;
  const toDate   = lastDay(ym);
  let ann = 0, bid = 0;

  // 공고 수집
  if (!opts.skipAnn) {
    try {
      const rows = await fetchAnnouncements({ fromDate, toDate, numOfRows: 999, maxPages: 999 });
      try {
        ann = await upsertAnnouncementBatch(rows);
      } catch (e) {
        logger.error(`  배치 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      // H-2 #2: G2BCode07Error는 메인 루프가 처리하도록 전파
      if (e instanceof G2BCode07Error) throw e;
      logger.error(`[${ym}] 공고 수집 오류`, e);
    }
    await sleep(300);
  }

  // 낙찰결과 수집
  if (!opts.skipBid) {
    try {
      const rows = await fetchBidResults({ fromDate, toDate, numOfRows: 999, maxPages: 999 });
      try {
        bid = await upsertBidResultBatch(rows);
      } catch (e) {
        logger.error(`  낙찰결과 배치 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      if (e instanceof G2BCode07Error) throw e;
      logger.error(`[${ym}] 낙찰결과 수집 오류`, e);
    }
    await sleep(300);
  }

  return { ann, bid };
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { from, to, skipBid, skipAnn } = parseArgs();
  const JOB = "bulk-import";

  // H-2 #3 커서: 이전 실행이 한도/장애로 중단된 경우 그 다음 월부터 재개
  const prevCursor = await loadBulkCursor(JOB);
  let resumeFrom = from;
  if (prevCursor && prevCursor.reason !== "DONE" && prevCursor.lastYm >= from && prevCursor.lastYm < to) {
    resumeFrom = addMonths(prevCursor.lastYm, 1);
    logger.info(`[H-2 #3] 이전 커서 복원: ${prevCursor.lastYm} (${prevCursor.reason}) → ${resumeFrom}부터 재개`);
  }

  // 수집할 월 목록 생성 (오래된 순)
  const months: string[] = [];
  let cur = resumeFrom;
  while (cur <= to) {
    months.push(cur);
    cur = addMonths(cur, 1);
  }

  const mode = skipBid ? "공고만" : skipAnn ? "낙찰결과만" : "공고+낙찰결과";
  logger.info(`=== 전체 수집 시작: ${resumeFrom} ~ ${to} (총 ${months.length}개월, ${mode}, numOfRows=999) ===`);

  let totalAnn = 0, totalBid = 0;
  const startTime = Date.now();

  for (let i = 0; i < months.length; i++) {
    const ym = months[i];
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const pct = Math.round(((i + 1) / months.length) * 100);
    logger.info(`[${i + 1}/${months.length}] ${ym} 수집 중... (${pct}% / 경과 ${elapsed}초)`);

    try {
      const { ann, bid } = await importMonth(ym, { skipBid, skipAnn });
      totalAnn += ann;
      totalBid += bid;

      logger.info(`  → 공고 ${ann}건 / 낙찰결과 ${bid}건 저장 (누적: 공고 ${totalAnn}, 낙찰 ${totalBid})`);

      // 매 월 성공 직후 커서 갱신
      await saveBulkCursor({ job: JOB, lastYm: ym, reason: "OK" });
    } catch (e) {
      // H-2 #2/#1: G2B 07 (한도/장애) 받으면 즉시 중단 + 커서 저장
      if (e instanceof G2BCode07Error) {
        await saveBulkCursor({ job: JOB, lastYm: ym, lastOp: e.operation, reason: "CODE_07" });
        logger.error(`[H-2] ${ym} 중단: G2BCode07Error (op=${e.operation}, page=${e.pageNo}) — 커서 저장. 한도 리셋 후 재실행하면 ${addMonths(ym, 1)}부터 재개`);
        process.exit(2); // exit code 2 = 한도/장애로 중단 (CI에서 구분 가능)
      }
      // 그 외 오류는 기존대로 다음 월로
      logger.error(`[${ym}] 예외 발생, 다음 월로 진행:`, e);
    }
  }

  // 정상 완료
  await saveBulkCursor({ job: JOB, lastYm: to, reason: "DONE" });
  const totalSec = Math.round((Date.now() - startTime) / 1000);
  logger.info(`=== 전체 수집 완료: 공고 ${totalAnn}건 / 낙찰결과 ${totalBid}건 / 소요 ${totalSec}초 ===`);
}

main().catch((err) => {
  logger.error("치명적 오류", err);
  process.exit(1);
});

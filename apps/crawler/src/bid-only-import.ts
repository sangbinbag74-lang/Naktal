/**
 * 낙찰결과만 수집 (공고 건너뜀)
 * 실행: ts-node src/bid-only-import.ts --from 202001
 */

import * as path from "path";
loadEnv();

import { fetchBidResults } from "./fetchers/g2b-bid-result";
import { upsertBidResult } from "./db/upsert";
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
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function currentYM(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function lastDay(ym: string): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6));
  return `${ym}${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

function addMonths(ym: string, n: number): string {
  const y = parseInt(ym.slice(0, 4));
  const m = parseInt(ym.slice(4, 6)) + n - 1;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseArgs(): { from: string; to: string } {
  const args = process.argv.slice(2);
  let from = "202001", to = currentYM();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) from = args[i + 1];
    if (args[i] === "--to"   && args[i + 1]) to   = args[i + 1];
  }
  return { from, to };
}

async function main() {
  const { from, to } = parseArgs();
  const months: string[] = [];
  let cur = from;
  while (cur <= to) { months.push(cur); cur = addMonths(cur, 1); }

  logger.info(`=== 낙찰결과 수집 시작: ${from} ~ ${to} (총 ${months.length}개월) ===`);

  let totalBid = 0;
  const startTime = Date.now();

  for (let i = 0; i < months.length; i++) {
    const ym = months[i];
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.info(`[${i + 1}/${months.length}] ${ym} (경과 ${elapsed}초)`);

    try {
      const rows = await fetchBidResults({
        fromDate: `${ym}01`, toDate: lastDay(ym),
        numOfRows: 100, maxPages: 999,
      });
      let saved = 0;
      for (const row of rows) {
        try { await upsertBidResult(row); saved++; } catch { /* skip */ }
      }
      totalBid += saved;
      logger.info(`  → 낙찰결과 ${saved}건 저장 (누적 ${totalBid})`);
    } catch (e) {
      logger.error(`[${ym}] 낙찰결과 수집 오류: ${e}`);
    }
    await sleep(300);
  }

  logger.info(`=== 완료: 낙찰결과 총 ${totalBid}건 ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });

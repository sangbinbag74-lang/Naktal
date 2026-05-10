/**
 * 활성 공고 (deadline > NOW) PDF 본문에서 자격제한 추출 → pdfRgnLimit 저장
 *
 * 실행: pnpm ts-node src/scripts/backfill-pdf-region.ts [--limit N] [--concurrency N]
 *
 * 기본: 전체 활성 공고 / 동시 4개
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import { extractRgnLimitFromPdf, PdfRgnLimit } from "../lib/pdf-region-extract";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const args = process.argv.slice(2);
const argLimit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 0;
const argConcurrency = args.includes("--concurrency") ? Number(args[args.indexOf("--concurrency") + 1]) : 4;

(async () => {
  const pool = new Pool({ connectionString: url, max: 8 });
  try {
    // 활성 공고 중 아직 파싱 안 된 것
    const limitClause = argLimit > 0 ? `LIMIT ${argLimit}` : "";
    const { rows } = await pool.query(`
      SELECT id, "konepsId", "rawJson"->>'ntceSpecDocUrl1' AS pdf
      FROM "Announcement"
      WHERE deadline > NOW()
        AND "pdfParsedAt" IS NULL
        AND "rawJson"->>'ntceSpecDocUrl1' IS NOT NULL
        AND "rawJson"->>'ntceSpecDocUrl1' != ''
      ORDER BY deadline ASC
      ${limitClause}
    `);
    console.log(`총 ${rows.length}건 처리 시작 (concurrency=${argConcurrency})`);

    let processed = 0;
    let success = 0;
    let sigun = 0, gwangyeok = 0, national = 0, unknown = 0;
    const t0 = Date.now();

    // 동시 처리 워커
    async function worker() {
      while (true) {
        const row = rows.shift();
        if (!row) return;
        try {
          const result: PdfRgnLimit = await extractRgnLimitFromPdf(row.pdf);
          await pool.query(
            `UPDATE "Announcement" SET "pdfRgnLimit"=$1::jsonb, "pdfParsedAt"=NOW() WHERE id=$2`,
            [JSON.stringify(result), row.id],
          );
          success++;
          if (result.type === "sigun") sigun++;
          else if (result.type === "gwangyeok") gwangyeok++;
          else if (result.type === "national") national++;
          else unknown++;
        } catch (e) {
          console.error(`  [에러] ${row.konepsId}:`, (e as Error).message.slice(0, 100));
        }
        processed++;
        if (processed % 25 === 0) {
          const rate = processed / ((Date.now() - t0) / 1000);
          const eta = Math.round(rows.length / rate);
          console.log(`  ${processed}건 처리 (${rate.toFixed(1)}건/s, 잔여 ETA ${eta}초) — sigun=${sigun} gw=${gwangyeok} 전국=${national} unknown=${unknown}`);
        }
      }
    }

    const workers = Array.from({ length: argConcurrency }, () => worker());
    await Promise.all(workers);

    const dt = Math.round((Date.now() - t0) / 1000);
    console.log(`\n=== 완료 ===`);
    console.log(`총 처리: ${processed} / 성공: ${success} / 소요: ${dt}초`);
    console.log(`분류: 시·군 ${sigun} / 광역 ${gwangyeok} / 전국 ${national} / unknown ${unknown}`);
  } finally {
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });

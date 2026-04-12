/**
 * 기존 Announcement 데이터에 subCategories 채우기
 * rawJson의 subsiCnsttyNm1~9 → MAIN_CNSTWK_MAP → subCategories[]
 *
 * 실행: npx tsx apps/crawler/src/migrate-subcategories.ts
 */

import * as path from "path";
import * as fs from "fs";
import { Pool } from "pg";
import { parseSubCategories } from "./category-map";

// ─── .env 로드 ──────────────────────────────────────────────────────────────
function loadEnv(): string {
  const rootEnv = path.resolve(__dirname, "../../../.env");
  try {
    const content = fs.readFileSync(rootEnv, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DIRECT_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
      if (key === "DATABASE_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
    }
  } catch { /* ignore */ }
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
}

const DATABASE_URL = loadEnv();
if (!DATABASE_URL) {
  console.error("DATABASE_URL 또는 DIRECT_URL 환경변수 필요");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 3,
  statement_timeout: 30000,
});

const BATCH_SIZE = 500;

async function main() {
  const client = await pool.connect();
  console.log("부종공종 마이그레이션 시작...");

  try {
    // rawJson이 있고 subsiCnsttyNm1이 비어있지 않은 행만 처리
    // cursor 방식: id 기준 배치
    let offset = 0;
    let processed = 0;
    let updated = 0;

    while (true) {
      const { rows } = await client.query<{
        id: string;
        rawJson: Record<string, string> | null;
      }>(
        `SELECT id, "rawJson"
         FROM "Announcement"
         WHERE "rawJson" IS NOT NULL
           AND "rawJson"->>'subsiCnsttyNm1' != ''
           AND "rawJson"->>'subsiCnsttyNm1' IS NOT NULL
         ORDER BY id
         LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset],
      );

      if (rows.length === 0) break;

      // subCategories 계산
      const toUpdate = rows
        .map((r) => ({
          id: r.id,
          subCategories: parseSubCategories(r.rawJson ?? undefined),
        }))
        .filter((r) => r.subCategories.length > 0);

      // 배치 UPDATE
      for (const row of toUpdate) {
        await client.query(
          `UPDATE "Announcement"
           SET "subCategories" = $1
           WHERE id = $2`,
          [row.subCategories, row.id],
        );
        updated++;
      }

      processed += rows.length;
      offset += rows.length;

      if (processed % 5000 === 0 || rows.length < BATCH_SIZE) {
        console.log(`처리: ${processed}건 / 업데이트: ${updated}건`);
      }

      if (rows.length < BATCH_SIZE) break;
    }

    console.log(`\n완료! 전체 조사: ${processed}건, subCategories 업데이트: ${updated}건`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

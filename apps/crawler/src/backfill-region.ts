/**
 * region 컬럼 backfill — 옛 Announcement row 의 region 빈 값을 rawJson 폴백으로 채움
 *
 * 박상빈님 5/20 명시 — cron sync-g2b 의 region 폴백 fix (commit ec471d7) 은 신규 공고만 적용.
 * 옛 row 13,402+ 의 region 빈 값은 별도 backfill 필요.
 *
 * 폴백 순서 (cron sync-g2b 와 동일):
 *   cnstrtsiteRgnNm (공사현장) → dminsttNm (수요기관) → ntceInsttNm (공고기관)
 *
 * 박상빈님 메모리 적용:
 *   - feedback_local_nohup_for_bulk: 로컬 nohup 으로 실행
 *   - feedback_recollect_acceleration: 2 worker (해당 안 — DB 만)
 *   - feedback_verify_data_not_just_count: 완료 후 표본 SELECT
 *
 * 실행: pnpm ts-node src/backfill-region.ts
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

// 박상빈님 5/20 — cron sync-g2b/route.ts 의 region 폴백 매핑과 동일
// lib/g2b.ts 의 g2bExtractRegion 함수와 같은 REGION_MAP
const REGION_MAP: [string, string][] = [
  ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"],
  ["광주", "광주"], ["대전", "대전"], ["울산", "울산"], ["세종", "세종"],
  ["경기", "경기"], ["강원", "강원"], ["충북", "충북"], ["충남", "충남"],
  ["전북", "전북"], ["전남", "전남"], ["경북", "경북"], ["경남", "경남"],
  ["제주", "제주"],
];
function extractRegion(addr: string): string {
  if (!addr) return "";
  for (const [p, l] of REGION_MAP) if (addr.startsWith(p)) return l;
  return addr.slice(0, 2);
}

function loadDbUrl(): string {
  const env: Record<string, string> = {};
  const candidates = [
    path.resolve(__dirname, "../../../.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const c = fs.readFileSync(p, "utf-8");
      for (const l of c.split("\n")) {
        const t = l.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i === -1) continue;
        env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      }
      break;
    }
  }
  return env.DATABASE_URL || process.env.DATABASE_URL || "";
}

async function main() {
  const dbUrl = loadDbUrl();
  if (!dbUrl) { console.error("DATABASE_URL 미설정"); process.exit(1); }
  const pool = new Pool({ connectionString: dbUrl, max: 4, statement_timeout: 0 });

  // region 빈 row 전수 조회 (만료 + 활성 모두)
  console.log("=== region 빈 row 조회 중 ===");
  const { rows } = await pool.query<{
    id: string;
    konepsId: string;
    cnstrtsite: string | null;
    dminstt: string | null;
    ntceInstt: string | null;
  }>(`
    SELECT id, "konepsId",
           "rawJson"->>'cnstrtsiteRgnNm' AS cnstrtsite,
           "rawJson"->>'dminsttNm'       AS dminstt,
           "rawJson"->>'ntceInsttNm'     AS "ntceInstt"
    FROM "Announcement"
    WHERE ("region" IS NULL OR "region" = '')
  `);
  console.log(`region 빈 row: ${rows.length}건`);

  if (rows.length === 0) {
    console.log("채울 row 없음");
    await pool.end();
    return;
  }

  // 폴백 매핑 + UPDATE
  const tStart = Date.now();
  let updated = 0;
  let stillEmpty = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const payload = slice.map((r) => {
      const src = (r.cnstrtsite ?? "") || (r.dminstt ?? "") || (r.ntceInstt ?? "");
      const region = extractRegion(src);
      if (!region) stillEmpty++;
      return { id: r.id, region };
    }).filter((x) => x.region);

    if (payload.length === 0) continue;

    await pool.query(
      `UPDATE "Announcement" a SET "region" = v.region
       FROM jsonb_to_recordset($1::jsonb) AS v(id text, region text)
       WHERE a.id = v.id`,
      [JSON.stringify(payload)],
    );
    updated += payload.length;

    const rate = (i + BATCH) / ((Date.now() - tStart) / 1000);
    const eta = Math.round((rows.length - i - BATCH) / rate);
    console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length} (${rate.toFixed(0)} row/s, ETA ${eta}s) | 누적 update ${updated}`);
  }

  console.log(`\n=== 완료: ${updated}건 update / ${stillEmpty}건 폴백 모두 빈 (rawJson 부족) ===`);

  // 박상빈님 메모리 verify_data_not_just_count — 표본 SELECT 검증
  const { rows: sample } = await pool.query<{ konepsId: string; region: string; src: string }>(`
    SELECT "konepsId", "region",
           COALESCE("rawJson"->>'cnstrtsiteRgnNm', "rawJson"->>'dminsttNm', "rawJson"->>'ntceInsttNm', '') AS src
    FROM "Announcement"
    WHERE "region" IS NOT NULL AND "region" != ''
    ORDER BY random() LIMIT 10
  `);
  console.log("\n=== 표본 검증 10건 ===");
  for (const s of sample) {
    console.log(`  ${s.konepsId} | region="${s.region}" | src="${s.src.slice(0, 40)}"`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

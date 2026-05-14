/**
 * W3 — 박상빈님 명시 13개 추가 매핑 패턴 (2026-05-14)
 *
 * 박상빈님 결정 (audit 결과):
 *   - 본사 매핑 X (조달청·한국X공사·한국방송공사 등) — 그대로 유지
 *   - 지사·캠퍼스·시군구 = 사업 지역 명확 → 매핑 추가
 *
 * 13개 패턴:
 *   고양시 → 경기 / 경상대학교 → 경남 / 한국농촌공사 동진지사 → 전북
 *   경찰대학 → 충남 / 한국교원대학교 → 충북 / 수도권매립지관리공사 → 인천
 *   한국과학기술원 → 대전 / 대한석탄공사 도계 → 강원
 *   마산지방해양항만청 → 경남 / 국립경국대학교 → 경북 / 부경대학교 → 부산
 *   한국농촌공사 무진장지사 → 전북 / 한국해양대학교 → 부산
 *
 * 패턴: 15 connection parallel, 700 row × 10 batch
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const VALID = "('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')";
const CNSTWK_FILTER = `(category LIKE '%공사%' OR category LIKE '%시설%' OR category LIKE '%건축%' OR category LIKE '%토목%' OR category LIKE '%전기%' OR category LIKE '%통신%' OR category LIKE '%소방%' OR category LIKE '%조경%' OR category LIKE '%포장%' OR category LIKE '%수도%' OR category LIKE '%기계%' OR category LIKE '%상하수도%' OR category LIKE '%산업환경%' OR category LIKE '%금속%' OR category LIKE '%지반%' OR category LIKE '%실내%' OR category LIKE '%문화재%')`;

// W3 추가 13개 매핑
const REGION_CASE_W3 = `
  CASE
    WHEN "orgName" ~ '고양시' THEN '경기'
    WHEN "orgName" ~ '경상대학교' THEN '경남'
    WHEN "orgName" ~ '한국농촌공사.*동진' THEN '전북'
    WHEN "orgName" ~ '경찰대학' THEN '충남'
    WHEN "orgName" ~ '한국교원대학교' THEN '충북'
    WHEN "orgName" ~ '수도권매립지관리공사' THEN '인천'
    WHEN "orgName" ~ '한국과학기술원|KAIST' THEN '대전'
    WHEN "orgName" ~ '대한석탄공사.*도계' THEN '강원'
    WHEN "orgName" ~ '마산지방해양항만청' THEN '경남'
    WHEN "orgName" ~ '국립경국대학교' THEN '경북'
    WHEN "orgName" ~ '부경대학교' THEN '부산'
    WHEN "orgName" ~ '한국농촌공사.*무진장' THEN '전북'
    WHEN "orgName" ~ '한국해양대학교' THEN '부산'
    ELSE NULL
  END
`;

const WHERE_ABNORMAL_CNSTWK = `(region IS NULL OR region = '' OR region NOT IN ${VALID}) AND ${CNSTWK_FILTER}`;

const BATCH = 700;
const PARALLEL = 10;
const MAX_RETRY = 30;
const RETRY_DELAY_MS = 60000;

(async () => {
  let pool: Pool | null = null;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      pool = new Pool({ connectionString: url, max: PARALLEL, statement_timeout: 0, connectionTimeoutMillis: 10000 });
      await pool.query("SELECT 1");
      console.log(`pool 연결 성공 (attempt ${attempt}/${MAX_RETRY})`);
      break;
    } catch (e) {
      console.log(`[attempt ${attempt}/${MAX_RETRY}] pool 연결 실패: ${(e as Error).message.slice(0, 80)}`);
      if (pool) await pool.end().catch(() => {});
      pool = null;
      if (attempt < MAX_RETRY) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      else { console.error("ERR: pool 연결 최종 실패"); process.exit(1); }
    }
  }
  if (!pool) { process.exit(1); }

  try {
    console.log("=== W3 진행 (13개 추가 매핑 패턴) ===\n");

    // 0. 좀비 종료 (region UPDATE 쿼리)
    const stuck = await pool.query(`
      SELECT pid FROM pg_stat_activity
      WHERE state = 'active' AND pid <> pg_backend_pid()
        AND query LIKE 'UPDATE "Announcement"%region%'
        AND EXTRACT(EPOCH FROM (NOW() - query_start)) > 600
    `);
    if (stuck.rows.length > 0) {
      console.log(`좀비 ${stuck.rows.length}개 종료`);
      for (const r of stuck.rows) {
        await pool.query(`SELECT pg_terminate_backend($1)`, [r.pid]);
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    // 1. 대상 row 수 — 13개 패턴 매칭 가능한 row 만 (orgName 정규식)
    const PATTERN_OR = `("orgName" ~ '고양시' OR "orgName" ~ '경상대학교' OR "orgName" ~ '한국농촌공사.*동진' OR "orgName" ~ '경찰대학' OR "orgName" ~ '한국교원대학교' OR "orgName" ~ '수도권매립지관리공사' OR "orgName" ~ '한국과학기술원|KAIST' OR "orgName" ~ '대한석탄공사.*도계' OR "orgName" ~ '마산지방해양항만청' OR "orgName" ~ '국립경국대학교' OR "orgName" ~ '부경대학교' OR "orgName" ~ '한국농촌공사.*무진장' OR "orgName" ~ '한국해양대학교')`;
    const total = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "Announcement" WHERE ${WHERE_ABNORMAL_CNSTWK} AND ${PATTERN_OR}`);
    const totalRows = Number(total.rows[0].cnt);
    console.log(`대상 row: ${totalRows.toLocaleString()}건 (W3 패턴 매칭 + 비정상 region + 공사 카테고리)\n`);

    if (totalRows === 0) {
      console.log("처리할 row 없음. 종료.");
      return;
    }

    // 2. batch 루프
    const t0 = Date.now();
    let processed = 0;
    let batchNum = 0;
    while (true) {
      batchNum++;
      const tb = Date.now();

      const list = await pool.query(`
        SELECT id FROM "Announcement"
        WHERE ${WHERE_ABNORMAL_CNSTWK} AND ${PATTERN_OR}
        LIMIT ${BATCH * PARALLEL}
      `);
      if (list.rows.length === 0) break;

      const chunks: string[][] = [];
      for (let i = 0; i < list.rows.length; i += BATCH) {
        chunks.push(list.rows.slice(i, i + BATCH).map(r => r.id));
      }

      const results = await Promise.all(
        chunks.map(ids =>
          pool!.query(`
            UPDATE "Announcement"
            SET region = COALESCE(${REGION_CASE_W3}, region)
            WHERE id = ANY($1)
          `, [ids])
        )
      );
      const updatedThis = results.reduce((s, r) => s + (r.rowCount ?? 0), 0);
      processed += updatedThis;

      const batchSec = (Date.now() - tb) / 1000;
      const totalSec = (Date.now() - t0) / 1000;
      const rate = processed / totalSec;
      const remaining = Math.max(0, totalRows - processed);
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : 0;
      console.log(`[batch ${batchNum}] +${updatedThis} 누적=${processed.toLocaleString()}/${totalRows.toLocaleString()} | ${batchSec.toFixed(1)}초 | ${rate.toFixed(0)}/초 | 남은 ${etaMin}분`);

      if (list.rows.length < BATCH * PARALLEL) break;
    }

    // 3. 사후 검증 — W3 패턴 매칭 row 의 잔여 비정상
    const after = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "Announcement" WHERE ${WHERE_ABNORMAL_CNSTWK} AND ${PATTERN_OR}`);
    const totalRemain = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "Announcement" WHERE ${WHERE_ABNORMAL_CNSTWK}`);
    console.log(`\n=== W3 완료 ===`);
    console.log(`  정정: ${processed.toLocaleString()}건`);
    console.log(`  W3 패턴 매칭 잔여 비정상: ${Number(after.rows[0].cnt).toLocaleString()}건`);
    console.log(`  전체 잔여 비정상 (공사): ${Number(totalRemain.rows[0].cnt).toLocaleString()}건`);
    console.log(`  총 ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
})();

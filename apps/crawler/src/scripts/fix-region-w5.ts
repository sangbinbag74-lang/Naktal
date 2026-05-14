/**
 * W5 — keyset pagination (id > last_max_id) — 무한 루프 차단
 *
 * 박상빈님 명시 (2026-05-14): W4 무한 루프 (ELSE '' SET → WHERE region='' 재매칭) 해결
 *   - 매 batch SELECT 시 id > lastMaxId 조건 추가
 *   - region SET 결과와 무관하게 1회만 처리 보장
 *   - 옛 '' row 포함 매핑 시도 (100% 채움 룰)
 *
 * 패턴: 10 connection parallel, 700 row × 10 batch, keyset (id ORDER)
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const VALID = "('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')";
const CNSTWK_FILTER = "(category LIKE '%공사%' OR category LIKE '%시설%' OR category LIKE '%건축%' OR category LIKE '%토목%' OR category LIKE '%전기%' OR category LIKE '%통신%' OR category LIKE '%소방%' OR category LIKE '%조경%' OR category LIKE '%포장%' OR category LIKE '%수도%' OR category LIKE '%기계%' OR category LIKE '%상하수도%' OR category LIKE '%산업환경%' OR category LIKE '%금속%' OR category LIKE '%지반%' OR category LIKE '%실내%' OR category LIKE '%문화재%')";

const REGION_CASE_W5 = `
  CASE
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '국외%' THEN ''
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '서울%' THEN '서울'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '부산%' THEN '부산'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '대구%' THEN '대구'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '인천%' THEN '인천'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '광주%' THEN '광주'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '대전%' THEN '대전'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '울산%' THEN '울산'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '세종%' THEN '세종'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '경기%' THEN '경기'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '강원%' THEN '강원'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '충청북도%' OR "rawJson"->>'cnstrtsiteRgnNm' LIKE '충북%' THEN '충북'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '충청남도%' OR "rawJson"->>'cnstrtsiteRgnNm' LIKE '충남%' THEN '충남'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '전라북도%' OR "rawJson"->>'cnstrtsiteRgnNm' LIKE '전북%' THEN '전북'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '전라남도%' OR "rawJson"->>'cnstrtsiteRgnNm' LIKE '전남%' THEN '전남'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '경상북도%' OR "rawJson"->>'cnstrtsiteRgnNm' LIKE '경북%' THEN '경북'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '경상남도%' OR "rawJson"->>'cnstrtsiteRgnNm' LIKE '경남%' THEN '경남'
    WHEN "rawJson"->>'cnstrtsiteRgnNm' LIKE '제주%' THEN '제주'
    WHEN "rawJson"->>'dminsttNm' ~ '대전지방국토관리청|충남대학교|국립한밭대학교|국립대전현충원|한국과학기술정보연구원|한국생명공학연구원|한국원자력안전기술원' THEN '대전'
    WHEN "rawJson"->>'dminsttNm' ~ '부산지방국토관리청|부산교통공사|부산항건설사무소|부산지방해양수산청|부산지방해양항만청' THEN '부산'
    WHEN "rawJson"->>'dminsttNm' ~ '익산지방국토관리청|전북대학교' THEN '전북'
    WHEN "rawJson"->>'dminsttNm' ~ '여수지방해양수산청|여수지방해양항만청|여수항건설사무소' THEN '전남'
    WHEN "rawJson"->>'dminsttNm' ~ '서울지방국토관리청|서울특별시' THEN '서울'
    WHEN "rawJson"->>'dminsttNm' ~ '인천광역시' THEN '인천'
    WHEN "rawJson"->>'dminsttNm' ~ '대구광역시|경북대학교' THEN '대구'
    WHEN "rawJson"->>'dminsttNm' ~ '광주광역시' THEN '광주'
    WHEN "rawJson"->>'dminsttNm' ~ '울산광역시' THEN '울산'
    WHEN "rawJson"->>'dminsttNm' ~ '행정중심복합도시건설청|세종특별자치시' THEN '세종'
    WHEN "rawJson"->>'dminsttNm' ~ '경기도' THEN '경기'
    WHEN "rawJson"->>'dminsttNm' ~ '국립공주대학교|충청남도교육청|한국기술교육대학교|중앙소방학교|충청남도' THEN '충남'
    WHEN "rawJson"->>'dminsttNm' ~ '충북대학교|국립보건연구원|충청북도' THEN '충북'
    WHEN "rawJson"->>'dminsttNm' ~ '강원대학교|강원특별자치도|강원도' THEN '강원'
    WHEN "rawJson"->>'dminsttNm' ~ '경상북도' THEN '경북'
    WHEN "rawJson"->>'dminsttNm' ~ '경상남도' THEN '경남'
    WHEN "rawJson"->>'dminsttNm' ~ '전라남도' THEN '전남'
    WHEN "rawJson"->>'dminsttNm' ~ '전북특별자치도|전라북도' THEN '전북'
    WHEN "rawJson"->>'dminsttNm' ~ '국립기상과학원|제주특별자치도' THEN '제주'
    WHEN "rawJson"->>'dminsttNm' ~ '판교지사' THEN '경기'
    ELSE ''
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
    console.log("=== W5 진행 (keyset pagination, 무한 루프 차단) ===\n");

    const stuck = await pool.query(`
      SELECT pid FROM pg_stat_activity
      WHERE state = 'active' AND pid <> pg_backend_pid()
        AND query LIKE 'UPDATE "Announcement"%region%'
        AND EXTRACT(EPOCH FROM (NOW() - query_start)) > 600
    `);
    if (stuck.rows.length > 0) {
      console.log(`좀비 ${stuck.rows.length}개 종료`);
      for (const r of stuck.rows) await pool.query(`SELECT pg_terminate_backend($1)`, [r.pid]);
      await new Promise(r => setTimeout(r, 3000));
    }

    const total = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "Announcement" WHERE ${WHERE_ABNORMAL_CNSTWK}`);
    const totalRows = Number(total.rows[0].cnt);
    console.log(`대상 row: ${totalRows.toLocaleString()}건\n`);

    if (totalRows === 0) {
      console.log("처리할 row 없음. 종료.");
      return;
    }

    const t0 = Date.now();
    let processed = 0;
    let batchNum = 0;
    let lastMaxId = "";

    while (true) {
      batchNum++;
      const tb = Date.now();

      const list = await pool.query(`
        SELECT id FROM "Announcement"
        WHERE id > $1 AND ${WHERE_ABNORMAL_CNSTWK}
        ORDER BY id
        LIMIT ${BATCH * PARALLEL}
      `, [lastMaxId]);
      if (list.rows.length === 0) break;

      lastMaxId = list.rows[list.rows.length - 1].id;

      const chunks: string[][] = [];
      for (let i = 0; i < list.rows.length; i += BATCH) {
        chunks.push(list.rows.slice(i, i + BATCH).map(r => r.id));
      }

      const results = await Promise.all(
        chunks.map(ids =>
          pool!.query(`
            UPDATE "Announcement"
            SET region = ${REGION_CASE_W5}
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

    const after = await pool.query(`SELECT COUNT(*)::int AS cnt FROM "Announcement" WHERE ${WHERE_ABNORMAL_CNSTWK}`);
    const distribution = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE region IN ${VALID})::int AS valid,
        COUNT(*) FILTER (WHERE region = '')::int AS empty,
        COUNT(*) FILTER (WHERE region IS NULL)::int AS null_cnt,
        COUNT(*)::int AS total
      FROM "Announcement" WHERE ${CNSTWK_FILTER}
    `);
    console.log(`\n=== W5 완료 ===`);
    console.log(`  정정: ${processed.toLocaleString()}건`);
    console.log(`  잔여 비정상 (공사): ${Number(after.rows[0].cnt).toLocaleString()}건`);
    console.log(`  공사 전체 분포:`);
    console.log(`    region IN VALID: ${Number(distribution.rows[0].valid).toLocaleString()}`);
    console.log(`    region = '': ${Number(distribution.rows[0].empty).toLocaleString()}`);
    console.log(`    region = NULL: ${Number(distribution.rows[0].null_cnt).toLocaleString()}`);
    console.log(`    총 공사: ${Number(distribution.rows[0].total).toLocaleString()}`);
    console.log(`  총 ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분`);
  } catch (e) {
    console.error("ERR:", (e as Error).message);
    process.exit(1);
  } finally {
    await pool!.end();
    process.exit(0);
  }
})();

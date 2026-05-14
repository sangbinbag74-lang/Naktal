/**
 * W1·W3·W5 적용 후 region 정정 결과 검증 (2026-05-14)
 * 박상빈님 룰: feedback_verify_data_not_just_count — COUNT 가 아닌 표본 SELECT
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
const VALID = "('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')";
const CNSTWK = "(category LIKE '%공사%' OR category LIKE '%시설%' OR category LIKE '%건축%' OR category LIKE '%토목%' OR category LIKE '%전기%' OR category LIKE '%통신%' OR category LIKE '%소방%' OR category LIKE '%조경%' OR category LIKE '%포장%' OR category LIKE '%수도%' OR category LIKE '%기계%' OR category LIKE '%상하수도%' OR category LIKE '%산업환경%' OR category LIKE '%금속%' OR category LIKE '%지반%' OR category LIKE '%실내%' OR category LIKE '%문화재%')";
function ts() { const k = new Date(Date.now() + 9*3600*1000); return k.toISOString().slice(11,19); }

(async () => {
  const p = new Pool({ connectionString: url, max: 1, statement_timeout: 300000 });
  try {
    console.log(`[${ts()}] === 1. 공사 카테고리 region 분포 (W5 최종) ===`);
    const r1 = await p.query(`
      SELECT region, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE ${CNSTWK} AND region IN ${VALID}
      GROUP BY region ORDER BY cnt DESC
    `);
    for (const r of r1.rows) console.log(`[REGION] ${String(r.region).padEnd(4)} ${Number(r.cnt).toLocaleString()}`);

    console.log(`\n[${ts()}] === 2. 본사 매핑 X 룰 검증 — 한국전력공사 공사 region 분포 ===`);
    const r2 = await p.query(`
      SELECT COALESCE(NULLIF(region,''),'<EMPTY>') AS r, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE "orgName" = '한국전력공사' AND ${CNSTWK}
      GROUP BY region ORDER BY cnt DESC LIMIT 10
    `);
    for (const r of r2.rows) console.log(`[KEPCO] ${String(r.r).padEnd(8)} ${Number(r.cnt).toLocaleString()}`);

    console.log(`\n[${ts()}] === 3. 본사 매핑 X 룰 검증 — 한국철도공사 공사 region 분포 ===`);
    const r3 = await p.query(`
      SELECT COALESCE(NULLIF(region,''),'<EMPTY>') AS r, COUNT(*)::int AS cnt
      FROM "Announcement"
      WHERE "orgName" LIKE '한국철도공사%' AND ${CNSTWK}
      GROUP BY region ORDER BY cnt DESC LIMIT 10
    `);
    for (const r of r3.rows) console.log(`[KRAIL] ${String(r.r).padEnd(8)} ${Number(r.cnt).toLocaleString()}`);

    console.log(`\n[${ts()}] === 4. W5 정정 표본 — region IN VALID + cnstrt 채워진 row 5건 ===`);
    const r4 = await p.query(`
      SELECT "orgName", category, region,
        LEFT("rawJson"->>'cnstrtsiteRgnNm', 30) AS cnstrt,
        LEFT("rawJson"->>'dminsttNm', 30) AS dmstt
      FROM "Announcement"
      WHERE region IN ${VALID} AND ${CNSTWK}
        AND "rawJson"->>'cnstrtsiteRgnNm' <> ''
      ORDER BY "createdAt" DESC LIMIT 5
    `);
    for (const r of r4.rows) {
      console.log(`[OK1] region=${r.region} | cnstrt='${r.cnstrt ?? ""}' | dmstt='${r.dmstt ?? ""}' | org=${r.orgName}`);
    }

    console.log(`\n[${ts()}] === 5. W3 매핑 표본 — 고양시 ===`);
    const r5 = await p.query(`
      SELECT "orgName", region FROM "Announcement"
      WHERE "orgName" ~ '고양시' AND ${CNSTWK} AND region IN ${VALID}
      ORDER BY "createdAt" DESC LIMIT 5
    `);
    for (const r of r5.rows) console.log(`[OK2] region=${r.region} | org=${r.orgName}`);

    console.log(`\n[${ts()}] === 6. region='' (매핑 불가) 표본 5건 ===`);
    const r6 = await p.query(`
      SELECT "orgName", category,
        LEFT("rawJson"->>'cnstrtsiteRgnNm', 30) AS cnstrt,
        LEFT("rawJson"->>'dminsttNm', 30) AS dmstt
      FROM "Announcement"
      WHERE region = '' AND ${CNSTWK}
      ORDER BY "createdAt" DESC LIMIT 5
    `);
    for (const r of r6.rows) {
      console.log(`[EMPT] org=${r.orgName} | cnstrt='${r.cnstrt ?? ""}' | dmstt='${r.dmstt ?? ""}'`);
    }

    console.log(`\n[${ts()}] === 7. 비정상 region 잔존 여부 (옛 버그값) ===`);
    const r7 = await p.query(`
      SELECT region, COUNT(*)::int AS cnt FROM "Announcement"
      WHERE region IS NOT NULL AND region <> '' AND region NOT IN ${VALID} AND ${CNSTWK}
      GROUP BY region ORDER BY cnt DESC LIMIT 10
    `);
    if (r7.rows.length === 0) {
      console.log(`[CHECK] 옛 버그 region 잔존: 0건 ✅`);
    } else {
      console.log(`[CHECK] 옛 버그 region 잔존: ${r7.rows.length}종`);
      for (const r of r7.rows) console.log(`[BUG] '${r.region}' ${Number(r.cnt).toLocaleString()}`);
    }

    console.log(`\n[${ts()}] === DONE ===`);
  } finally { await p.end(); process.exit(0); }
})();

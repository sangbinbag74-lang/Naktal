/** 읽기 전용 — realtime-snapshot dbFilled 0 진단 (konepsId ↔ BidResult.annId 매칭) */
import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) { const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v; } throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();

  // 1. 최근 2일 마감 공고 konepsId 표본 5건
  const anns = await c.query(`
    SELECT "konepsId", deadline FROM "Announcement"
    WHERE deadline < now() AND deadline >= now() - interval '2 days'
    ORDER BY deadline DESC LIMIT 5`);
  console.log("최근 2일 마감 공고 konepsId 표본:");
  for (const r of anns.rows) console.log(`  ${r.konepsId} (마감 ${String(r.deadline).slice(0, 16)})`);

  // 2. BidResult.annId 형식 표본 5건 (최근 openedAt)
  const brs = await c.query(`SELECT "annId", "openedAt" FROM "BidResult" ORDER BY "openedAt" DESC NULLS LAST LIMIT 5`);
  console.log("\nBidResult.annId 최신 표본:");
  for (const r of brs.rows) console.log(`  ${r.annId} (개찰 ${String(r.openedAt).slice(0, 16)})`);

  // 3. 최근 2일 마감 공고 중 BidResult 매칭 수 (직접 SQL 조인)
  const m = await c.query(`
    SELECT COUNT(*)::bigint AS n
    FROM "Announcement" a JOIN "BidResult" b ON b."annId" = a."konepsId"
    WHERE a.deadline < now() AND a.deadline >= now() - interval '2 days'`);
  console.log(`\n2일 창 BidResult 매칭 (SQL 직접): ${m.rows[0].n}건`);

  // 3b. 접미사(-00 차수) 무시 매칭 시
  const m2 = await c.query(`
    SELECT COUNT(*)::bigint AS n
    FROM "Announcement" a JOIN "BidResult" b ON split_part(b."annId", '-', 1) = a."konepsId"
    WHERE a.deadline < now() AND a.deadline >= now() - interval '2 days'`);
  console.log(`2일 창 매칭 (차수 접미사 제거 기준): ${m2.rows[0].n}건`);

  // 4. BidOpeningDetail 쪽도
  const od = await c.query(`
    SELECT COUNT(*)::bigint AS n
    FROM "Announcement" a JOIN "BidOpeningDetail" o ON o."annId" = a."konepsId"
    WHERE a.deadline < now() AND a.deadline >= now() - interval '2 days'`);
  console.log(`2일 창 BidOpeningDetail 매칭: ${od.rows[0].n}건`);

  // 5. 창 넓히면? (7일)
  const w7 = await c.query(`
    SELECT COUNT(DISTINCT a.id)::bigint AS n
    FROM "Announcement" a JOIN "BidResult" b ON b."annId" = a."konepsId"
    WHERE a.deadline < now() AND a.deadline >= now() - interval '7 days'`);
  console.log(`7일 창 BidResult 매칭: ${w7.rows[0].n}건`);

  // 6. BidResult 최근 개찰 시각 분포 (일별)
  const dist = await c.query(`
    SELECT to_char("openedAt", 'MM-DD') AS d, COUNT(*)::bigint AS n
    FROM "BidResult" WHERE "openedAt" >= now() - interval '7 days'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 8`);
  console.log("\nBidResult 최근 7일 개찰 분포:");
  for (const r of dist.rows) console.log(`  ${r.d}: ${Number(r.n).toLocaleString()}건`);

  c.release(); await pool.end();
})();

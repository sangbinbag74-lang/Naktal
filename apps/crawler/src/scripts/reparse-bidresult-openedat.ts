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

// G2B opengDt 형식 2종을 모두 PG 측에서 처리
// 1) "YYYY-MM-DD HH:MM:SS" 또는 "YYYY-MM-DD HH:MM"
// 2) "YYYYMMDDHHMMSS" 또는 "YYYYMMDDHHMM"
const PARSE_SQL = `
  CASE
    WHEN a."rawJson"->>'opengDt' ~ '^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}'
      THEN (a."rawJson"->>'opengDt')::timestamptz AT TIME ZONE 'Asia/Seoul'
    WHEN a."rawJson"->>'opengDt' ~ '^\\d{12,14}$'
      THEN to_timestamp(rpad(a."rawJson"->>'opengDt', 14, '0'), 'YYYYMMDDHH24MISS') AT TIME ZONE 'Asia/Seoul'
    ELSE NULL
  END
`;

(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 1800000 });
  const c = await pool.connect();

  console.log("[reparse-bidresult-openedat] 시작");
  const before = await c.query(`SELECT COUNT(*)::bigint AS t, COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::bigint AS f FROM "BidResult"`);
  console.log(`  현황: ${Number(before.rows[0].f).toLocaleString()} / ${Number(before.rows[0].t).toLocaleString()} (${(Number(before.rows[0].f)/Number(before.rows[0].t)*100).toFixed(2)}%)`);

  // 월별 chunk: Announcement.deadline 기준 (BidResult에 deadline 없음)
  const months: { from: string; to: string }[] = [];
  for (let y = 2002; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 5) break;
      const next = m === 12 ? `${y+1}-01-01` : `${y}-${String(m+1).padStart(2,'0')}-01`;
      months.push({ from: `${y}-${String(m).padStart(2,'0')}-01`, to: next });
    }
  }

  let totalUpdated = 0;
  const t0 = Date.now();
  for (let i = 0; i < months.length; i++) {
    const { from, to } = months[i];
    const ts = Date.now();
    try {
      const r = await c.query(`
        UPDATE "BidResult" br
        SET "openedAt" = ${PARSE_SQL}
        FROM "Announcement" a
        WHERE a."konepsId" = br."annId"
          AND br."openedAt" IS NULL
          AND NULLIF(a."rawJson"->>'opengDt','') IS NOT NULL
          AND a."deadline" >= $1::timestamptz
          AND a."deadline" < $2::timestamptz
      `, [from, to]);
      const n = r.rowCount ?? 0;
      totalUpdated += n;
      const elapsed = ((Date.now()-ts)/1000).toFixed(1);
      const total = ((Date.now()-t0)/60000).toFixed(1);
      console.log(`  [${i+1}/${months.length}] ${from} → ${n.toLocaleString()} 행 (${elapsed}s, 누적 ${totalUpdated.toLocaleString()}, ${total}분)`);
    } catch (e: any) {
      console.log(`  [${i+1}/${months.length}] ${from} ❌ ${e.message}`);
    }
  }

  const after = await c.query(`SELECT COUNT(*)::bigint AS t, COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::bigint AS f FROM "BidResult"`);
  console.log(`\n=== 완료 ===`);
  console.log(`  최종: ${Number(after.rows[0].f).toLocaleString()} / ${Number(after.rows[0].t).toLocaleString()} (${(Number(after.rows[0].f)/Number(after.rows[0].t)*100).toFixed(2)}%)`);
  console.log(`  총 UPDATE: ${totalUpdated.toLocaleString()} 행`);
  console.log(`  총 소요: ${((Date.now()-t0)/60000).toFixed(1)} 분`);

  // 샘플 5건 형식 확인
  console.log(`\n=== openedAt 샘플 5건 (형식 검증) ===`);
  const s = await c.query(`SELECT "annId", "openedAt" FROM "BidResult" WHERE "openedAt" IS NOT NULL LIMIT 5`);
  for (const row of s.rows) console.log(`  ${row.annId}: ${row.openedAt}`);

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

const rootEnv = path.resolve(__dirname, "../../../../.env");
const c = fs.readFileSync(rootEnv, "utf-8");
let url = "";
for (const l of c.split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") url = v;
}

(async () => {
  const pool = new Pool({ connectionString: url });

  // 1. deadline 기준 월별 분포 (이상값 제거: 2002~2030)
  const r1 = await pool.query<{ ym: string; cnt: string }>(`
    SELECT TO_CHAR("deadline", 'YYYY-MM') AS ym, COUNT(*)::text AS cnt
    FROM "Announcement"
    WHERE "deadline" >= '2002-01-01' AND "deadline" < '2030-01-01'
    GROUP BY 1 ORDER BY 1
  `);

  console.log("=== deadline 월별 분포 (전체) ===");
  let prev = "";
  let prevCnt = 0;
  const monthly: { ym: string; cnt: number }[] = [];
  for (const row of r1.rows) {
    monthly.push({ ym: row.ym, cnt: parseInt(row.cnt) });
  }
  for (const { ym, cnt } of monthly) {
    let mark = "";
    if (cnt < 1000) mark = " ⚠️ <1000";
    else if (prev && cnt < prevCnt * 0.3) mark = " 📉 급감";
    console.log(ym, cnt.toString().padStart(7), mark);
    prev = ym;
    prevCnt = cnt;
  }

  // 2. 1000건 미만 의심 구간 추출
  console.log("\n=== ⚠️ 의심 월(1000건 미만) ===");
  const suspicious = monthly.filter((m) => m.cnt < 1000);
  for (const { ym, cnt } of suspicious) {
    console.log(ym, cnt.toString().padStart(7));
  }
  if (suspicious.length === 0) console.log("(없음)");

  // 3. 누락 월 (0건) 식별
  console.log("\n=== ❌ 누락 월(분포에 아예 없는 달) ===");
  const present = new Set(monthly.map((m) => m.ym));
  const missing: string[] = [];
  if (monthly.length > 0) {
    const first = monthly[0].ym;
    const last = monthly[monthly.length - 1].ym;
    let cur = first;
    while (cur <= last) {
      if (!present.has(cur)) missing.push(cur);
      const [y, m] = cur.split("-").map((s) => parseInt(s));
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      cur = next;
    }
  }
  for (const ym of missing) console.log(ym, "      0");
  if (missing.length === 0) console.log("(없음)");

  // 4. 최근 6개월 일별 분포 (2025-12 ~ 2026-05)
  console.log("\n=== 최근 일별 분포 (deadline 2025-11 ~ 2026-05) ===");
  const r2 = await pool.query<{ d: string; cnt: string }>(`
    SELECT TO_CHAR("deadline", 'YYYY-MM-DD') AS d, COUNT(*)::text AS cnt
    FROM "Announcement"
    WHERE "deadline" >= '2025-11-01' AND "deadline" < '2026-06-01'
    GROUP BY 1 ORDER BY 1
  `);
  for (const row of r2.rows) {
    const cnt = parseInt(row.cnt);
    let mark = "";
    if (cnt < 100) mark = " ⚠️";
    if (cnt === 0) mark = " ❌";
    console.log(row.d, cnt.toString().padStart(5), mark);
  }

  // 5. createdAt 기준 6개월 일별 (수집 시점 분포 — gap 시점 직접 확인)
  console.log("\n=== createdAt 기준 일별 (2025-11 ~ 2026-05) ===");
  const r3 = await pool.query<{ d: string; cnt: string }>(`
    SELECT TO_CHAR("createdAt"::date, 'YYYY-MM-DD') AS d, COUNT(*)::text AS cnt
    FROM "Announcement"
    WHERE "createdAt" >= '2025-11-01' AND "createdAt" < '2026-06-01'
    GROUP BY 1 ORDER BY 1
  `);
  for (const row of r3.rows) {
    const cnt = parseInt(row.cnt);
    let mark = "";
    if (cnt < 100) mark = " ⚠️";
    if (cnt === 0) mark = " ❌";
    console.log(row.d, cnt.toString().padStart(7), mark);
  }

  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

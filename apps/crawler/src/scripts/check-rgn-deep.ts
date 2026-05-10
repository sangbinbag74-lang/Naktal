import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    // 1. bidPrtcptLmtYn=N 인데 jnt 지역 명시된 케이스 수
    console.log("=== bidPrtcptLmtYn=N 인데 jntcontrctDutyRgnNm1 비어있지 않은 건 ===");
    const r1 = await p.query(`
      SELECT COUNT(*)::int AS cnt FROM "AnnouncementActive"
      WHERE "rawJson"->>'bidPrtcptLmtYn' = 'N'
        AND COALESCE("rawJson"->>'jntcontrctDutyRgnNm1','') != ''
    `);
    console.log("  cnt:", r1.rows[0].cnt);

    // 2. bidPrtcptLmtYn=N 인데 rgnDutyJntcontrctYn=Y 인 건
    console.log("\n=== bidPrtcptLmtYn=N + rgnDutyJntcontrctYn=Y ===");
    const r2 = await p.query(`
      SELECT COUNT(*)::int AS cnt FROM "AnnouncementActive"
      WHERE "rawJson"->>'bidPrtcptLmtYn' = 'N'
        AND "rawJson"->>'rgnDutyJntcontrctYn' = 'Y'
    `);
    console.log("  cnt:", r2.rows[0].cnt);

    // 3. cmmnSpldmdCorpRgnLmtYn / rgnLmtBidLocplcJdgmBssCd 다른 지역 제한 필드
    console.log("\n=== cmmnSpldmdCorpRgnLmtYn 분포 ===");
    const r3 = await p.query(`
      SELECT "rawJson"->>'cmmnSpldmdCorpRgnLmtYn' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive" GROUP BY v ORDER BY cnt DESC
    `);
    for (const r of r3.rows) console.log(" ", JSON.stringify(r.v).padEnd(15), "->", r.cnt);

    console.log("\n=== rgnLmtBidLocplcJdgmBssCd 분포 ===");
    const r4 = await p.query(`
      SELECT "rawJson"->>'rgnLmtBidLocplcJdgmBssCd' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive" GROUP BY v ORDER BY cnt DESC
    `);
    for (const r of r4.rows) console.log(" ", JSON.stringify(r.v).padEnd(15), "->", r.cnt);

    // 4. 가로수 결주지 보식사업 - 모든 raw 필드 풀 덤프 (지역 관련만)
    console.log("\n=== 사용자 공고 raw 전체 (가로수 결주지) ===");
    const r5 = await p.query(`SELECT "rawJson" FROM "AnnouncementActive" WHERE title ILIKE '%가로수 결주지 보식%' LIMIT 1`);
    if (r5.rows[0]) {
      const rj = r5.rows[0].rawJson as Record<string, unknown>;
      const keys = Object.keys(rj).sort();
      for (const k of keys) {
        const v = rj[k];
        if (typeof v !== "string") continue;
        const lk = k.toLowerCase();
        if (lk.includes("rgn") || lk.includes("lmt") || lk.includes("prtcpt") || lk.includes("instt") || lk.includes("locplc") || lk.includes("jntcontrct") || lk.includes("crd")) {
          console.log("  ", k.padEnd(35), "=", JSON.stringify(v));
        }
      }
    }

    // 5. 동일 발주처 (완주군) 의 다른 공고들 — 지역제한 필드 분포
    console.log("\n=== 전북 완주군 발주 공고 bidPrtcptLmtYn 분포 ===");
    const r6 = await p.query(`
      SELECT "rawJson"->>'bidPrtcptLmtYn' AS v, COUNT(*)::bigint AS cnt
      FROM "AnnouncementActive"
      WHERE "orgName" ILIKE '%완주군%'
      GROUP BY v ORDER BY cnt DESC
    `);
    for (const r of r6.rows) console.log(" ", JSON.stringify(r.v).padEnd(15), "->", r.cnt);
  } finally { await p.end(); }
})().catch(e => { console.error(e); process.exit(1); });

/**
 * 현재 DB 저장 상황 즉시 snapshot
 * - 각 테이블 row count + 핵심 필드 채움률
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

(function loadEnv() {
  const candidates = [
    path.resolve(__dirname, "../../../web/.env.local"),
    path.resolve(__dirname, "../../../../.env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const c = fs.readFileSync(p, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!k) continue;
      if (v.includes("[YOUR-PASSWORD]") || v.includes("your-project")) continue;
      if (!process.env[k]) process.env[k] = v;
    }
  }
})();

(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("DATABASE_URL 미설정"); process.exit(1); }
  const pool = new Pool({ connectionString: dbUrl, max: 2 });

  console.log(`\n=== 현재 DB Snapshot (${new Date().toISOString()}) ===\n`);

  const checks = [
    { name: "Announcement (총)", sql: `SELECT COUNT(*)::bigint AS n FROM "Announcement"` },
    { name: "  - subCategories 채움", sql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE array_length("subCategories",1) > 0` },
    { name: "  - bsisAmt > 0", sql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "bsisAmt" > 0` },
    { name: "  - aValueTotal > 0", sql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "aValueTotal" > 0` },
    { name: "  - sucsfbidLwltRate > 0", sql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "sucsfbidLwltRate" > 0` },
    { name: "  - bidNtceDtlUrl 채움", sql: `SELECT COUNT(*)::bigint AS n FROM "Announcement" WHERE "bidNtceDtlUrl" IS NOT NULL AND "bidNtceDtlUrl" != ''` },
    { name: "BidResult (낙찰)", sql: `SELECT COUNT(*)::bigint AS n FROM "BidResult"` },
    { name: "  - finalPrice > 0", sql: `SELECT COUNT(*)::bigint AS n FROM "BidResult" WHERE "finalPrice" > 0` },
    { name: "  - winnerName 채움", sql: `SELECT COUNT(*)::bigint AS n FROM "BidResult" WHERE "winnerName" IS NOT NULL AND "winnerName" != ''` },
    { name: "BidOpeningDetail (개찰)", sql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail"` },
    { name: "  - prdprcList 채움 (jsonb_array_length>0)", sql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail" WHERE jsonb_array_length("prdprcList") > 0` },
    { name: "  - selPrdprcIdx 채움 (array_length>0)", sql: `SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail" WHERE array_length("selPrdprcIdx",1) > 0` },
    { name: "AnnouncementChgHst (변경공고)", sql: `SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst"` },
    { name: "  - chgItemNm 채움", sql: `SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst" WHERE "chgItemNm" IS NOT NULL AND "chgItemNm" != ''` },
    { name: "PreStdrd (사전규격)", sql: `SELECT COUNT(*)::bigint AS n FROM "PreStdrd"` },
  ];

  for (const c of checks) {
    try {
      const r = await pool.query(c.sql);
      const n = Number(r.rows[0].n);
      console.log(`${c.name.padEnd(50)} ${n.toLocaleString()}`);
    } catch (e) {
      console.log(`${c.name.padEnd(50)} (err: ${(e as Error).message.slice(0, 60)})`);
    }
  }

  await pool.end();
  console.log(`\n=== Snapshot 완료 ===`);
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * 마케팅용 DB 통계 — 모든 핵심 데이터 규모
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const env = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
const url = env.split("\n").find(l => l.startsWith("DIRECT_URL="))!.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const log = (s: string) => process.stdout.write(s + "\n");

async function q(p: Pool, sql: string): Promise<string> {
  try {
    const r = await p.query(sql);
    return JSON.stringify(r.rows[0]);
  } catch (e) {
    return "ERR: " + (e as Error).message.slice(0, 80);
  }
}

(async () => {
  const p = new Pool({ connectionString: url, max: 1 });
  try {
    log("=== 📊 마케팅용 DB 통계 ===\n");

    log("─── 1. 핵심 데이터 규모 ───");
    log("Announcement (공고): " + await q(p, `SELECT to_char(reltuples::bigint,'FM999,999,999') AS count FROM pg_class WHERE relname='Announcement'`));
    log("BidResult (낙찰 결과): " + await q(p, `SELECT to_char(reltuples::bigint,'FM999,999,999') AS count FROM pg_class WHERE relname='BidResult'`));
    log("BidOpeningDetail (개찰 번호): " + await q(p, `SELECT to_char(reltuples::bigint,'FM999,999,999') AS count FROM pg_class WHERE relname='BidOpeningDetail'`));
    log("AnnouncementChgHst (공고 변경): " + await q(p, `SELECT to_char(reltuples::bigint,'FM999,999,999') AS count FROM pg_class WHERE relname='AnnouncementChgHst'`));
    log("PreStdrd (사전규격): " + await q(p, `SELECT to_char(reltuples::bigint,'FM999,999,999') AS count FROM pg_class WHERE relname='PreStdrd'`));
    log("SajungRateStat (사정율 통계): " + await q(p, `SELECT to_char(COUNT(*),'FM999,999,999') AS count FROM "SajungRateStat"`));

    log("\n─── 2. 활성 공고 ───");
    log("활성: " + await q(p, `SELECT to_char(COUNT(*),'FM999,999,999') AS active FROM "AnnouncementActive"`));

    log("\n─── 3. 수집 기간 ───");
    log("기간: " + await q(p, `SELECT MIN(deadline)::date AS oldest, MAX(deadline)::date AS newest FROM "AnnouncementActive"`));
    log("전체 공고 기간: " + await q(p, `SELECT MIN("createdAt")::date AS oldest, MAX("createdAt")::date AS newest FROM "Announcement" WHERE "createdAt" IS NOT NULL`));

    log("\n─── 4. 카테고리 다양성 ───");
    log("Distinct category: " + await q(p, `SELECT COUNT(DISTINCT category) AS cnt FROM "Announcement" WHERE category IS NOT NULL AND category != ''`));
    log("Distinct region: " + await q(p, `SELECT COUNT(DISTINCT region) AS cnt FROM "Announcement" WHERE region IS NOT NULL AND region != ''`));
    log("Distinct orgName: " + await q(p, `SELECT to_char(COUNT(DISTINCT "orgName"),'FM999,999,999') AS cnt FROM "Announcement" WHERE "orgName" IS NOT NULL`));

    log("\n─── 5. PDF 자격 추출 ───");
    log("pdfParsedAt 채움: " + await q(p, `SELECT to_char(COUNT(*),'FM999,999,999') AS cnt FROM "Announcement" WHERE "pdfParsedAt" IS NOT NULL`));
    log("type 분포: " + await q(p, `SELECT json_object_agg(t, c) AS dist FROM (SELECT "pdfRgnLimit"->>'type' AS t, COUNT(*) AS c FROM "Announcement" WHERE "pdfRgnLimit" IS NOT NULL GROUP BY t) x`));

    log("\n─── 6. 사정율 통계 ───");
    log("ALL 카테고리: " + await q(p, `SELECT to_char(COUNT(*),'FM999,999,999') AS cnt FROM "SajungRateStat" WHERE "orgName"='ALL'`));
    log("발주처별: " + await q(p, `SELECT to_char(COUNT(DISTINCT "orgName"),'FM999,999,999') AS orgs FROM "SajungRateStat" WHERE "orgName" != 'ALL'`));

    log("\n─── 7. 사용자/이용 ───");
    log("User: " + await q(p, `SELECT COUNT(*) AS u FROM "User"`));
    log("BidRequest (의뢰): " + await q(p, `SELECT COUNT(*) AS r FROM "BidRequest"`));
    log("BidPricePrediction (예측 캐시): " + await q(p, `SELECT to_char(COUNT(*),'FM999,999,999') AS cnt FROM "BidPricePrediction"`));

    log("\n=== DONE ===");
  } catch (e) {
    process.stderr.write("ERR=" + (e as Error).message + "\n");
  } finally {
    await p.end();
    process.exit(0);
  }
})();

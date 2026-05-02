/**
 * 2024-03 한 달 윈도우 채움율 검증 (C/D 2024-03 테스트 결과)
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDbUrl(): string {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(rootEnv, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  return process.env.DATABASE_URL!;
}

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });
  const BGN = "2024-03-01";
  const END = "2024-04-01";

  process.stdout.write(`=== 2024-03 윈도우 채움율 (deadline ${BGN} ~ ${END}) ===\n\n`);

  const q = async (label: string, sql: string) => {
    const r = await pool.query(sql);
    process.stdout.write(`${label}\n  ${JSON.stringify(r.rows[0])}\n\n`);
  };

  await q("Announcement 2024-03 기본",
    `SELECT
       COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE "subCategories" IS NOT NULL AND array_length("subCategories",1) > 0)::bigint AS subcat_filled,
       COUNT(*) FILTER (WHERE "bsisAmt" > 0)::bigint AS bsis_filled,
       COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS avalue_filled
     FROM "Announcement"
     WHERE "deadline" >= '${BGN}'::timestamptz AND "deadline" < '${END}'::timestamptz`);

  await q("AnnouncementChgHst 2024-03 (chgDate 기준)",
    `SELECT
       COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE "chgItemNm" != '')::bigint AS item_filled,
       COUNT(*) FILTER (WHERE "bfChgVal" != '')::bigint AS bf_filled,
       COUNT(*) FILTER (WHERE "afChgVal" != '')::bigint AS af_filled
     FROM "AnnouncementChgHst"
     WHERE "chgDate" >= '${BGN}'::timestamptz AND "chgDate" < '${END}'::timestamptz`);

  await q("BidOpeningDetail 2024-03 (openingDate 기준)",
    `SELECT
       COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1) >= 4)::bigint AS sel_ge4,
       COUNT(*) FILTER (WHERE array_length("selPrdprcIdx",1) > 0)::bigint AS sel_any
     FROM "BidOpeningDetail"
     WHERE "openingDate" >= '${BGN}'::timestamptz AND "openingDate" < '${END}'::timestamptz`);

  // 샘플
  process.stdout.write("--- subCategories 샘플 (2024-03) ---\n");
  const s1 = await pool.query(
    `SELECT "konepsId","title","subCategories" FROM "Announcement"
     WHERE "deadline" >= '${BGN}'::timestamptz AND "deadline" < '${END}'::timestamptz
       AND array_length("subCategories",1) > 0 LIMIT 3`,
  );
  process.stdout.write(JSON.stringify(s1.rows, null, 2) + "\n\n");

  process.stdout.write("--- aValueTotal 샘플 (2024-03) ---\n");
  const s2 = await pool.query(
    `SELECT "konepsId","title","aValueTotal","aValueDetails" FROM "Announcement"
     WHERE "deadline" >= '${BGN}'::timestamptz AND "deadline" < '${END}'::timestamptz
       AND "aValueTotal" > 0 LIMIT 3`,
  );
  process.stdout.write(JSON.stringify(s2.rows, null, 2) + "\n\n");

  await pool.end();
})();

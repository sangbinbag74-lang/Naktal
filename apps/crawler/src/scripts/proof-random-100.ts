/**
 * 랜덤 100개 표본 — 사용자가 눈으로 확인할 수 있게 실제 값 그대로 출력
 * COUNT 아님. 실제 데이터 인쇄.
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
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 120000 });

  // 1. Announcement — subCategories / ciblAplYn / mtltyAdvcPsblYn 가 채워진 랜덤 20개
  process.stdout.write("=".repeat(80) + "\n");
  process.stdout.write("## 1. Announcement — 실제 값 채움 확인 (랜덤 20개)\n");
  process.stdout.write("=".repeat(80) + "\n");
  const a = await pool.query(`
    SELECT "konepsId", title,
      "subCategories",
      "ciblAplYn", "mtltyAdvcPsblYn", "bsisAmt", "aValueTotal"
    FROM "Announcement" TABLESAMPLE BERNOULLI (0.05)
    WHERE array_length("subCategories", 1) > 0 OR "aValueTotal" > 0
    LIMIT 20
  `);
  for (const r of a.rows) {
    process.stdout.write(`\n[${r.konepsId}] ${String(r.title).slice(0, 50)}\n`);
    process.stdout.write(`  subCategories: ${JSON.stringify(r.subCategories)}\n`);
    process.stdout.write(`  ciblAplYn: "${r.ciblAplYn}" | mtltyAdvcPsblYn: "${r.mtltyAdvcPsblYn}"\n`);
    process.stdout.write(`  bsisAmt: ${r.bsisAmt} | aValueTotal: ${r.aValueTotal}\n`);
  }

  // 2. PreStdrd — bfSpecRgstNm (사전규격명), ntceInsttNm (기관명) 랜덤 20개
  process.stdout.write("\n" + "=".repeat(80) + "\n");
  process.stdout.write("## 2. PreStdrd — 방금 reparse 한 사전규격명/기관명 (랜덤 20개)\n");
  process.stdout.write("=".repeat(80) + "\n");
  const p = await pool.query(`
    SELECT "bfSpecRgstNo", "bfSpecRgstNm", "ntceInsttNm"
    FROM "PreStdrd" TABLESAMPLE BERNOULLI (0.1)
    WHERE COALESCE("bfSpecRgstNm",'') != ''
    LIMIT 20
  `);
  for (const r of p.rows) {
    process.stdout.write(`\n[${r.bfSpecRgstNo}]\n`);
    process.stdout.write(`  규격명: "${r.bfSpecRgstNm}"\n`);
    process.stdout.write(`  기관명: "${r.ntceInsttNm}"\n`);
  }

  // 3. AnnouncementChgHst — chgItemNm/bfChgVal/afChgVal 랜덤 20개
  process.stdout.write("\n" + "=".repeat(80) + "\n");
  process.stdout.write("## 3. AnnouncementChgHst — 변경 항목/전/후 값 (랜덤 20개)\n");
  process.stdout.write("=".repeat(80) + "\n");
  const ch = await pool.query(`
    SELECT "annId", "chgItemNm", "bfChgVal", "afChgVal"
    FROM "AnnouncementChgHst" TABLESAMPLE BERNOULLI (0.1)
    WHERE "chgItemNm" != '' LIMIT 20
  `);
  for (const r of ch.rows) {
    process.stdout.write(`\n[${r.annId}] 변경항목: "${r.chgItemNm}"\n`);
    process.stdout.write(`  before: "${String(r.bfChgVal).slice(0, 80)}"\n`);
    process.stdout.write(`  after:  "${String(r.afChgVal).slice(0, 80)}"\n`);
  }

  // 4. BidOpeningDetail — selPrdprcIdx, prdprcList (G-1 진행 중이라 부분만)
  process.stdout.write("\n" + "=".repeat(80) + "\n");
  process.stdout.write("## 4. BidOpeningDetail — Model 2 재료 (랜덤 20개, selPrdprcIdx != 빈배열)\n");
  process.stdout.write("=".repeat(80) + "\n");
  const o = await pool.query(`
    SELECT "annId", "selPrdprcIdx", "prdprcList"
    FROM "BidOpeningDetail" TABLESAMPLE BERNOULLI (0.01)
    WHERE array_length("selPrdprcIdx", 1) >= 4 LIMIT 20
  `);
  if (o.rows.length === 0) {
    process.stdout.write("  (아직 선택 데이터 없음 — G-1 진행 초기 단계)\n");
  } else {
    for (const r of o.rows) {
      process.stdout.write(`\n[${r.annId}]\n`);
      process.stdout.write(`  selPrdprcIdx (선택 4개): ${JSON.stringify(r.selPrdprcIdx)}\n`);
      const prdList = Array.isArray(r.prdprcList) ? r.prdprcList.slice(0, 4) : r.prdprcList;
      process.stdout.write(`  prdprcList 첫 4개: ${JSON.stringify(prdList).slice(0, 200)}\n`);
    }
  }

  // 5. BidOpeningDetail.sucsfbidRate (reparse 진행 중)
  process.stdout.write("\n" + "=".repeat(80) + "\n");
  process.stdout.write("## 5. BidOpeningDetail.sucsfbidRate — reparse 진행 상황 (랜덤 20개)\n");
  process.stdout.write("=".repeat(80) + "\n");
  const s = await pool.query(`
    SELECT "annId", "sucsfbidRate"
    FROM "BidOpeningDetail" TABLESAMPLE BERNOULLI (0.01)
    WHERE "sucsfbidRate" IS NOT NULL AND "sucsfbidRate" > 0
    LIMIT 20
  `);
  if (s.rows.length === 0) {
    process.stdout.write("  (아직 reparse 미완료)\n");
  } else {
    for (const r of s.rows) process.stdout.write(`  [${r.annId}] 낙찰률: ${r.sucsfbidRate}%\n`);
  }

  // 6. 요약
  process.stdout.write("\n" + "=".repeat(80) + "\n");
  process.stdout.write("## 요약 — 각 테이블 실제 채움율\n");
  process.stdout.write("=".repeat(80) + "\n");
  const sum = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM "PreStdrd" WHERE COALESCE("bfSpecRgstNm",'') != '')::bigint AS pre_nm,
      (SELECT COUNT(*) FROM "PreStdrd")::bigint AS pre_total,
      (SELECT COUNT(*) FROM "AnnouncementChgHst" WHERE "chgItemNm" != '')::bigint AS chg_item,
      (SELECT COUNT(*) FROM "AnnouncementChgHst")::bigint AS chg_total,
      (SELECT COUNT(*) FROM "BidOpeningDetail" WHERE array_length("selPrdprcIdx",1) >= 4)::bigint AS bod_sel,
      (SELECT COUNT(*) FROM "BidOpeningDetail" WHERE "sucsfbidRate" IS NOT NULL AND "sucsfbidRate" > 0)::bigint AS bod_rate,
      (SELECT COUNT(*) FROM "BidOpeningDetail")::bigint AS bod_total
  `);
  const r = sum.rows[0];
  const pct = (a: string, b: string) => `${((Number(a)/Number(b))*100).toFixed(2)}%`;
  process.stdout.write(`PreStdrd.bfSpecRgstNm:       ${r.pre_nm}/${r.pre_total} (${pct(r.pre_nm, r.pre_total)})\n`);
  process.stdout.write(`AnnouncementChgHst.chgItemNm: ${r.chg_item}/${r.chg_total} (${pct(r.chg_item, r.chg_total)})\n`);
  process.stdout.write(`BidOpeningDetail.selPrdprcIdx: ${r.bod_sel}/${r.bod_total} (${pct(r.bod_sel, r.bod_total)})  ← G-1 진행 중\n`);
  process.stdout.write(`BidOpeningDetail.sucsfbidRate: ${r.bod_rate}/${r.bod_total} (${pct(r.bod_rate, r.bod_total)})  ← reparse 진행 중\n`);

  await pool.end();
})();

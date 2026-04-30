/**
 * 플랜 대비 실제 수집 현황 비교
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDatabaseUrl(): string | undefined {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
    }
  } catch {}
  return process.env.DATABASE_URL;
}

async function main() {
  const pool = new Pool({ connectionString: loadDatabaseUrl()!, max: 1 });
  const c = await pool.connect();
  try {
    // 1. Announcement 11개 승격 컬럼 채움율
    const r1 = await c.query(`
      SELECT
        COUNT(*)::bigint AS total,
        SUM(CASE WHEN "sucsfbidLwltRate" > 0 THEN 1 ELSE 0 END)::bigint AS lwlt,
        SUM(CASE WHEN "ciblAplYn" != '' THEN 1 ELSE 0 END)::bigint AS cibl,
        SUM(CASE WHEN "mtltyAdvcPsblYn" != '' THEN 1 ELSE 0 END)::bigint AS mtlty,
        SUM(CASE WHEN "bidNtceDtlUrl" != '' THEN 1 ELSE 0 END)::bigint AS url,
        SUM(CASE WHEN "ntceInsttOfclTelNo" != '' THEN 1 ELSE 0 END)::bigint AS tel,
        SUM(CASE WHEN "bsisAmt" > 0 THEN 1 ELSE 0 END)::bigint AS bsis,
        SUM(CASE WHEN "rsrvtnPrceRngBgnRate" != 0 THEN 1 ELSE 0 END)::bigint AS rng,
        SUM(CASE WHEN "aValueTotal" > 0 THEN 1 ELSE 0 END)::bigint AS aval,
        SUM(CASE WHEN "aValueDetails" IS NOT NULL THEN 1 ELSE 0 END)::bigint AS aval_det,
        SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::bigint AS subcat
      FROM "Announcement"
    `);
    const x = r1.rows[0];
    const t = Number(x.total);
    const pct = (n: string | number) => ((Number(n) / t) * 100).toFixed(2);

    console.log(`=== 플랜 대비 실제 수집 현황 ===\n`);
    console.log(`Announcement 전체: ${t.toLocaleString()}\n`);

    console.log(`[A. rawJson 승격 필드]`);
    console.log(`  sucsfbidLwltRate     : ${pct(x.lwlt).padStart(6)}%  (${Number(x.lwlt).toLocaleString()}) ← 낙찰하한율`);
    console.log(`  bidNtceDtlUrl        : ${pct(x.url).padStart(6)}%  (${Number(x.url).toLocaleString()}) ← 상세 URL`);
    console.log(`  ntceInsttOfclTelNo   : ${pct(x.tel).padStart(6)}%  (${Number(x.tel).toLocaleString()}) ← 담당자 연락처`);
    console.log(`  ciblAplYn            : ${pct(x.cibl).padStart(6)}%  (${Number(x.cibl).toLocaleString()}) ← 건산법 적용`);
    console.log(`  mtltyAdvcPsblYn      : ${pct(x.mtlty).padStart(6)}%  (${Number(x.mtlty).toLocaleString()}) ← 상호시장 진출`);

    console.log(`\n[B. API로 수집 필드]`);
    console.log(`  subCategories (업종) : ${pct(x.subcat).padStart(6)}%  (${Number(x.subcat).toLocaleString()}) ← 목표 95%+, UI 업종 필터 핵심`);
    console.log(`  bsisAmt (기초금액)   : ${pct(x.bsis).padStart(6)}%  (${Number(x.bsis).toLocaleString()}) ← 목표 90%+`);
    console.log(`  rsrvtnPrceRng*Rate   : ${pct(x.rng).padStart(6)}%  (${Number(x.rng).toLocaleString()}) ← 예가범위율`);
    console.log(`  aValueTotal (A값)    : ${pct(x.aval).padStart(6)}%  (${Number(x.aval).toLocaleString()}) ← G2B 한계 (대형 공사만)`);
    console.log(`  aValueDetails        : ${pct(x.aval_det).padStart(6)}%  (${Number(x.aval_det).toLocaleString()}) ← A값 6항목 상세`);

    // 2. 신규 테이블 상태
    const bod = await c.query(`SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail"`);
    const chg = await c.query(`SELECT COUNT(*)::bigint AS n FROM "AnnouncementChgHst"`);
    const pre = await c.query(`SELECT COUNT(*)::bigint AS n FROM "PreStdrd"`);

    console.log(`\n[C. 신규 테이블]`);
    console.log(`  BidOpeningDetail   : ${Number(bod.rows[0].n).toLocaleString()} ← CORE 2 재료 (복수예가 15개)`);
    console.log(`  AnnouncementChgHst : ${Number(chg.rows[0].n).toLocaleString()} ← 변경공고 이력`);
    console.log(`  PreStdrd           : ${Number(pre.rows[0].n).toLocaleString()} ← 사전규격`);
    console.log(`  AnnouncementExtra  : (계획만, 미생성) ← 선택 항목`);

    // 3. Opening : Announcement 비율
    const bodPct = ((Number(bod.rows[0].n) / t) * 100).toFixed(2);
    console.log(`\n[D. 핵심 비율 지표]`);
    console.log(`  BidOpeningDetail / Announcement : ${bodPct}% (= 복수예가 데이터 확보율)`);
    console.log(`  subCategories / Announcement    : ${pct(x.subcat)}% (= UI 업종 필터 커버리지)`);

    // 4. 플랜 목표 vs 실제
    console.log(`\n[E. 플랜 목표 대비]`);
    const targets = [
      { name: "subCategories", actual: Number(x.subcat) / t, target: 0.95 },
      { name: "bsisAmt", actual: Number(x.bsis) / t, target: 0.90 },
      { name: "sucsfbidLwltRate", actual: Number(x.lwlt) / t, target: 0.95 },
      { name: "bidNtceDtlUrl", actual: Number(x.url) / t, target: 0.95 },
      { name: "aValueTotal", actual: Number(x.aval) / t, target: 0.02 },
    ];
    for (const tg of targets) {
      const ratio = tg.actual / tg.target;
      const status = ratio >= 1.0 ? "✅ 달성" : ratio >= 0.7 ? "🟡 진행중" : "🔴 부족";
      console.log(`  ${tg.name.padEnd(20)}: ${(tg.actual * 100).toFixed(1)}% / 목표 ${(tg.target * 100).toFixed(0)}% = ${(ratio * 100).toFixed(0)}% ${status}`);
    }
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(console.error);

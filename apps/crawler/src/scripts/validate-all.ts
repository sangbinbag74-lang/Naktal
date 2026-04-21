/**
 * 전체 수집 결과 타당성 검증
 * 1. A값 bidPrceCalclAYn 실제 API 응답 확인 (버그 vs G2B 한계)
 * 2. bsisAmt / subCategories / ChgHst / BidOpeningDetail / PreStdrd 채움율 합리성
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
import * as https from "https";

function loadEnv(): { dbUrl: string; apiKey: string } {
  const rootEnv = path.resolve(__dirname, "../../../../.env");
  const env: Record<string, string> = {};
  try {
    const c = fs.readFileSync(rootEnv, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      env[k] = v;
    }
  } catch {}
  return {
    dbUrl: env.DATABASE_URL || process.env.DATABASE_URL || "",
    apiKey: env.KONEPS_API_KEY || env.G2B_API_KEY || process.env.KONEPS_API_KEY || "",
  };
}

function httpsGet(url: string, ms = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, ms);
    const req = https.get(url, (res) => {
      let body = "";
      res.on("data", (d: Buffer) => { body += d.toString(); });
      res.on("end", () => { clearTimeout(timer); resolve(body); });
      res.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

async function main() {
  const { dbUrl, apiKey } = loadEnv();
  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  console.log(`=== 수집 결과 전체 타당성 검증 ===\n`);

  // ─── 1. A값 bidPrceCalclAYn 필드 실제 API 응답 확인 ─────────────────
  console.log(`[1] A값 bidPrceCalclAYn 필드 G2B 응답 확인 (2010년 공사)`);
  const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
  const url = `${BASE}/getBidPblancListInfoCnstwkBsisAmount?serviceKey=${apiKey}&inqryDiv=1&inqryBgnDt=201005010000&inqryEndDt=201005052359&numOfRows=10&pageNo=1&type=json`;
  const text = await httpsGet(url);
  const json: any = JSON.parse(text);
  const items = json?.response?.body?.items ?? [];
  const arr = Array.isArray(items) ? items : (items?.item ? (Array.isArray(items.item) ? items.item : [items.item]) : []);
  let ynDist = { Y: 0, N: 0, empty: 0, missing: 0 };
  for (const it of arr) {
    const v = it.bidPrceCalclAYn;
    if (v === "Y") ynDist.Y++;
    else if (v === "N") ynDist.N++;
    else if (v === "" || v == null) ynDist.empty++;
    else ynDist.missing++;
  }
  console.log(`  API 응답 샘플 ${arr.length}건 중 bidPrceCalclAYn:`);
  console.log(`    Y: ${ynDist.Y} / N: ${ynDist.N} / 빈값: ${ynDist.empty} / 미존재: ${ynDist.missing}`);
  if (arr[0]) {
    console.log(`  샘플 1: bidNtceNo=${arr[0].bidNtceNo}, bidPrceCalclAYn="${arr[0].bidPrceCalclAYn}"`);
    console.log(`           sftyMngcst=${arr[0].sftyMngcst ?? "(없음)"}, bssamt=${arr[0].bssamt}`);
  }

  const c = await pool.connect();
  try {
    // ─── 2. bsisAmt 타당성 (공사 + 용역 + 물품 각각) ──────────────────
    console.log(`\n[2] 기초금액(bsisAmt) 채움율 검증`);
    const r2 = await c.query(`
      SELECT
        CASE
          WHEN category LIKE '%공사%' OR category = '시설공사' OR category = '외자' THEN '공사+외자'
          WHEN category = '용역' OR category LIKE '%용역%' THEN '용역'
          WHEN category = '물품' OR category LIKE '%물품%' THEN '물품'
          ELSE '기타'
        END AS grp,
        COUNT(*)::bigint AS total,
        SUM(CASE WHEN "bsisAmt" > 0 THEN 1 ELSE 0 END)::bigint AS filled
      FROM "Announcement"
      GROUP BY grp
      ORDER BY total DESC
    `);
    for (const row of r2.rows) {
      const t = Number(row.total);
      const f = Number(row.filled);
      const pct = t > 0 ? ((f / t) * 100).toFixed(1) : "0";
      console.log(`  ${(row.grp as string).padEnd(10)}: ${f.toString().padStart(9)} / ${t.toString().padStart(9)} (${pct}%)`);
    }

    // ─── 3. subCategories 공사 vs 기타 ──────────────────
    console.log(`\n[3] subCategories (업종) 채움율 — 공사 공고 위주`);
    const r3 = await c.query(`
      SELECT
        CASE
          WHEN category LIKE '%공사%' OR category = '시설공사' THEN '공사'
          WHEN category = '용역' THEN '용역'
          WHEN category = '물품' THEN '물품'
          ELSE '기타'
        END AS grp,
        COUNT(*)::bigint AS total,
        SUM(CASE WHEN array_length("subCategories", 1) > 0 THEN 1 ELSE 0 END)::bigint AS filled
      FROM "Announcement"
      GROUP BY grp
      ORDER BY total DESC
    `);
    for (const row of r3.rows) {
      const t = Number(row.total);
      const f = Number(row.filled);
      const pct = t > 0 ? ((f / t) * 100).toFixed(1) : "0";
      console.log(`  ${(row.grp as string).padEnd(10)}: ${f.toString().padStart(9)} / ${t.toString().padStart(9)} (${pct}%)`);
    }

    // ─── 4. BidOpeningDetail: 낙찰 완료 공고 대비 ──────────────────
    console.log(`\n[4] BidOpeningDetail 채움율 — BidResult 대비`);
    const r4a = await c.query(`SELECT COUNT(*)::bigint AS n FROM "BidResult"`);
    const r4b = await c.query(`SELECT COUNT(*)::bigint AS n FROM "BidOpeningDetail"`);
    const brTotal = Number(r4a.rows[0].n);
    const bodTotal = Number(r4b.rows[0].n);
    console.log(`  BidResult (낙찰 완료) : ${brTotal.toLocaleString()}`);
    console.log(`  BidOpeningDetail      : ${bodTotal.toLocaleString()}`);
    if (brTotal > 0) {
      const pct = ((bodTotal / brTotal) * 100).toFixed(1);
      console.log(`  비율: ${pct}% (BidResult 대비)`);
    }

    // 4a. BidOpeningDetail 연도별 분포
    const r4c = await c.query(`
      SELECT EXTRACT(YEAR FROM "openingDate")::int AS yr, COUNT(*)::bigint AS n
      FROM "BidOpeningDetail"
      WHERE "openingDate" IS NOT NULL
      GROUP BY yr ORDER BY yr
    `);
    console.log(`  연도별:`);
    for (const row of r4c.rows) {
      console.log(`    ${row.yr}: ${Number(row.n).toLocaleString()}`);
    }

    // ─── 5. AnnouncementChgHst 연도별 ──────────────────
    console.log(`\n[5] AnnouncementChgHst (변경공고) 연도별`);
    const r5 = await c.query(`
      SELECT EXTRACT(YEAR FROM "chgDate")::int AS yr, COUNT(*)::bigint AS n
      FROM "AnnouncementChgHst"
      WHERE "chgDate" IS NOT NULL
      GROUP BY yr ORDER BY yr
      LIMIT 25
    `);
    for (const row of r5.rows) {
      console.log(`  ${row.yr}: ${Number(row.n).toLocaleString()}`);
    }

    // ─── 6. PreStdrd 연도별 ──────────────────
    console.log(`\n[6] PreStdrd (사전규격) 연도별`);
    const r6 = await c.query(`
      SELECT EXTRACT(YEAR FROM "rcptDt")::int AS yr, COUNT(*)::bigint AS n
      FROM "PreStdrd"
      WHERE "rcptDt" IS NOT NULL
      GROUP BY yr ORDER BY yr
      LIMIT 25
    `);
    for (const row of r6.rows) {
      console.log(`  ${row.yr}: ${Number(row.n).toLocaleString()}`);
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(console.error);

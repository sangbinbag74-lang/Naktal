/**
 * 기존 660만 Announcement의 rawJson에서 7개 필드를 컬럼으로 승격
 * API 호출 0회. pg 직접 SQL UPDATE.
 *
 * 승격 필드:
 *   sucsfbidLwltRate (Float)   — rawJson->>sucsfbidLwltRate
 *   prtcptPsblRgnNm  (Text)    — rawJson->>prtcptPsblRgnNm
 *   jntcontrctDutyRgnNm        — rawJson->>jntcontrctDutyRgnNm
 *   ciblAplYn                  — rawJson->>ciblAplYn
 *   mtltyAdvcPsblYn            — rawJson->>mtltyAdvcPsblYn
 *   bidNtceDtlUrl              — rawJson->>bidNtceDtlUrl
 *   ntceInsttOfclTelNo         — rawJson->>ntceInsttOfclTelNo
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
  const url = loadDatabaseUrl();
  if (!url) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: url, max: 2, statement_timeout: 0 });
  const client = await pool.connect();
  try {
    console.log("=== rawJson 재파싱 시작 ===");

    // 배치 단위로 UPDATE (660만 한 번에는 무거움)
    const BATCH = 50000;
    let offset = 0;
    let totalUpdated = 0;
    const t0 = Date.now();

    // 먼저 전체 건수 확인
    const tot = await client.query(`SELECT COUNT(*)::int AS n FROM "Announcement"`);
    const total = tot.rows[0].n;
    console.log(`전체 ${total.toLocaleString()}건 처리 예정, 배치 ${BATCH}\n`);

    while (offset < total) {
      const t1 = Date.now();
      const res = await client.query(
        `
        WITH batch AS (
          SELECT id FROM "Announcement"
          ORDER BY id
          OFFSET $1 LIMIT $2
        )
        UPDATE "Announcement" a SET
          "sucsfbidLwltRate"    = COALESCE(NULLIF(a."rawJson"->>'sucsfbidLwltRate',''), '0')::double precision,
          "prtcptPsblRgnNm"     = COALESCE(a."rawJson"->>'prtcptPsblRgnNm', ''),
          "jntcontrctDutyRgnNm" = COALESCE(a."rawJson"->>'jntcontrctDutyRgnNm', ''),
          "ciblAplYn"           = COALESCE(a."rawJson"->>'ciblAplYn', ''),
          "mtltyAdvcPsblYn"     = COALESCE(a."rawJson"->>'mtltyAdvcPsblYn', ''),
          "bidNtceDtlUrl"       = COALESCE(a."rawJson"->>'bidNtceDtlUrl', ''),
          "ntceInsttOfclTelNo"  = COALESCE(a."rawJson"->>'ntceInsttOfclTelNo', '')
        FROM batch
        WHERE a.id = batch.id
        `,
        [offset, BATCH],
      );
      totalUpdated += res.rowCount ?? 0;
      offset += BATCH;
      const speed = ((res.rowCount ?? 0) / ((Date.now() - t1) / 1000)).toFixed(0);
      const pct = ((offset / total) * 100).toFixed(1);
      console.log(`  ${totalUpdated.toLocaleString()} / ${total.toLocaleString()} (${pct}%, ${speed}건/초)`);
    }

    const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
    console.log(`\n완료: ${totalUpdated.toLocaleString()}건 / 경과 ${elapsed}분`);

    // 검증 쿼리
    console.log("\n=== 검증 ===");
    const v = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN "sucsfbidLwltRate" > 0 THEN 1 ELSE 0 END)::int AS llRate,
        SUM(CASE WHEN "bidNtceDtlUrl" != '' THEN 1 ELSE 0 END)::int AS url,
        SUM(CASE WHEN "ntceInsttOfclTelNo" != '' THEN 1 ELSE 0 END)::int AS tel
      FROM "Announcement"
    `);
    const r = v.rows[0];
    console.log(`sucsfbidLwltRate 채움: ${r.llrate}/${r.total} (${(r.llrate / r.total * 100).toFixed(1)}%)`);
    console.log(`bidNtceDtlUrl 채움: ${r.url}/${r.total} (${(r.url / r.total * 100).toFixed(1)}%)`);
    console.log(`ntceInsttOfclTelNo 채움: ${r.tel}/${r.total} (${(r.tel / r.total * 100).toFixed(1)}%)`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

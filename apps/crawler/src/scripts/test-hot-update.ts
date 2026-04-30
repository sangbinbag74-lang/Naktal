/**
 * Phase E-1: HOT update 작동 검증 (단일 월 2024-01 테스트)
 *
 * 목표: Supabase에서 7개 rawJson → 컬럼 UPDATE가 HOT (Heap-Only Tuple) 로 동작하는지 확인
 *       HOT = 인덱스 없는 컬럼 변경 시 toast 재작성 없이 같은 페이지에 새 tuple 기록 → 훨씬 빠름
 *
 * 검증:
 *  1. 실행 전 pg_stat_user_tables.n_tup_upd / n_tup_hot_upd 기록
 *  2. 2024-01 범위 UPDATE 실행 (약 4만 행 예상)
 *  3. 실행 후 수치 비교 → hot 비율 계산
 *  4. 속도 측정 → 전체 24개월 ETA 산출
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

  console.log(`=== Phase E-1: HOT update 테스트 (2024-01) ===\n`);

  const c = await pool.connect();
  try {
    // 1. 신규 7 컬럼에 인덱스 있는지 확인
    const idx = await c.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'Announcement'
        AND (indexdef LIKE '%sucsfbidLwltRate%'
          OR indexdef LIKE '%bidNtceDtlUrl%'
          OR indexdef LIKE '%ntceInsttOfclTelNo%'
          OR indexdef LIKE '%ciblAplYn%'
          OR indexdef LIKE '%mtltyAdvcPsblYn%')
    `);
    console.log(`신규 7 컬럼 인덱스: ${idx.rowCount}건`);
    for (const r of idx.rows) console.log(`  - ${r.indexname}: ${r.indexdef}`);
    if ((idx.rowCount ?? 0) > 0) {
      console.log(`\n⚠️ 인덱스 있음 → HOT 불가. DROP 후 재시도 권장.\n`);
    } else {
      console.log(`✓ 인덱스 없음 → HOT 작동 조건 충족\n`);
    }

    // 2. 실행 전 통계
    const before = await c.query(`
      SELECT n_tup_upd, n_tup_hot_upd
      FROM pg_stat_user_tables
      WHERE schemaname = 'public' AND relname = 'Announcement'
    `);
    const beforeUpd = Number(before.rows[0]?.n_tup_upd ?? 0);
    const beforeHot = Number(before.rows[0]?.n_tup_hot_upd ?? 0);
    console.log(`실행 전: n_tup_upd=${beforeUpd}, n_tup_hot_upd=${beforeHot}`);

    // 3. 2024-01 예상 건수
    const cnt = await c.query(`
      SELECT COUNT(*)::int AS n
      FROM "Announcement"
      WHERE "deadline" >= '2024-01-01'::timestamptz
        AND "deadline" < '2024-02-01'::timestamptz
        AND "sucsfbidLwltRate" = 0
        AND "rawJson" IS NOT NULL
    `);
    const target = cnt.rows[0].n;
    console.log(`2024-01 대상: ${target.toLocaleString()}건\n`);

    if (target === 0) {
      console.log("대상 없음, 종료.");
      return;
    }

    // 4. UPDATE 실행 (시간 측정)
    console.log(`UPDATE 실행...`);
    const t0 = Date.now();
    const res = await c.query(`
      UPDATE "Announcement" SET
        "sucsfbidLwltRate"    = COALESCE(NULLIF("rawJson"->>'sucsfbidLwltRate',''),'0')::float8,
        "bidNtceDtlUrl"       = COALESCE("rawJson"->>'bidNtceDtlUrl',''),
        "ntceInsttOfclTelNo"  = COALESCE("rawJson"->>'ntceInsttOfclTelNo',''),
        "ciblAplYn"           = COALESCE("rawJson"->>'ciblAplYn',''),
        "mtltyAdvcPsblYn"     = COALESCE("rawJson"->>'mtltyAdvcPsblYn','')
      WHERE "deadline" >= '2024-01-01'::timestamptz
        AND "deadline" < '2024-02-01'::timestamptz
        AND "sucsfbidLwltRate" = 0
        AND "rawJson" IS NOT NULL
    `);
    const elapsed = (Date.now() - t0) / 1000;
    const updated = res.rowCount ?? 0;
    const speed = updated / elapsed;
    console.log(`완료: ${updated.toLocaleString()}건, ${elapsed.toFixed(1)}초, ${speed.toFixed(0)}건/초\n`);

    // 5. 실행 후 통계
    const after = await c.query(`
      SELECT n_tup_upd, n_tup_hot_upd
      FROM pg_stat_user_tables
      WHERE schemaname = 'public' AND relname = 'Announcement'
    `);
    const afterUpd = Number(after.rows[0]?.n_tup_upd ?? 0);
    const afterHot = Number(after.rows[0]?.n_tup_hot_upd ?? 0);
    const deltaUpd = afterUpd - beforeUpd;
    const deltaHot = afterHot - beforeHot;
    const hotPct = deltaUpd > 0 ? ((deltaHot / deltaUpd) * 100).toFixed(1) : "0";
    console.log(`실행 후: n_tup_upd=${afterUpd}, n_tup_hot_upd=${afterHot}`);
    console.log(`증가분: UPD +${deltaUpd}, HOT +${deltaHot} (${hotPct}%)\n`);

    // 6. 전체 24개월 ETA
    const fullTarget = 6_589_530;
    const etaSec = (fullTarget - 143_603) / speed;
    const etaHr = etaSec / 3600;
    console.log(`=== ETA ===`);
    console.log(`실측 속도: ${speed.toFixed(0)}건/초`);
    console.log(`남은 행 (대략): ${(fullTarget - 143_603).toLocaleString()}`);
    console.log(`예상 소요: ${etaHr.toFixed(1)}시간 (${(etaHr / 24).toFixed(1)}일)\n`);

    // 7. 판정
    console.log(`=== 판정 ===`);
    if (speed > 300 && Number(hotPct) > 80) {
      console.log(`✅ HOT 작동 + 속도 충분 → 대안 4 (월별 chunked) 진행`);
    } else if (speed > 100) {
      console.log(`⚠️ 속도 미흡 (${speed.toFixed(0)}건/초) → Fallback 1 (단일 CTAS) 검토`);
    } else {
      console.log(`❌ 속도 너무 느림 → Fallback 2 (reparse 무기한 연기)`);
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

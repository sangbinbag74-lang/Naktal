/**
 * 결측 필드 원인 조사:
 *   aValueTotal (6% 채움) — CalclA API 실수집 or 필드명 오매핑?
 *   subCategories (62.5%) — LicenseLimit API 커버 부족?
 *   chgRsnNm (0%) — AnnouncementChgHst rawJson에 다른 필드명?
 *   sucsfbidLwltRate (71%) — rawJson에 있는지 확인
 *
 * rawJson에 값이 있는데 컬럼에만 없으면 reparse만으로 해결 가능 (API 재호출 불요)
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
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 45000 });

  process.stdout.write("\n"); console.log("\n=== 1. aValueTotal 컬럼이 0인 공고의 rawJson에 A값 정보가 있는가? ===");
  const r1 = await pool.query(`
    SELECT "konepsId", "category",
      "rawJson"->>'bidNtceNm' AS title,
      "rawJson"->>'aValueYn' AS aValueYn,
      "rawJson"->>'aValueTotal' AS rawAValueTotal,
      "rawJson"->>'aValueAmt' AS aValueAmt,
      "rawJson"->>'aValueWlfareBnfit' AS aValueWlfareBnfit,
      "rawJson"->>'aValueSftymngcst' AS aValueSftymngcst,
      "rawJson"->>'aValueQltymngcst' AS aValueQltymngcst,
      "rawJson"->>'aValueIdstAccdtInsrprm' AS aValueIdstAccdtInsrprm,
      "rawJson"->>'aValueNpnIsrprm' AS aValueNpnIsrprm,
      "rawJson"->>'aValueHlthInsrprm' AS aValueHlthInsrprm,
      "rawJson"->>'aValueRtrmntGrntfLbrcst' AS aValueRtrmntGrntfLbrcst
    FROM "Announcement"
    WHERE "aValueTotal" = 0 AND "category" LIKE '%공사%'
    LIMIT 3
  `);
  for (const r of r1.rows) console.log(JSON.stringify(r, null, 2).slice(0, 1200));

  process.stdout.write("\n"); console.log("\n=== 2. subCategories가 비어있는 공고의 rawJson 업종 관련 필드 ===");
  const r2 = await pool.query(`
    SELECT "konepsId",
      "rawJson"->>'bidNtceNm' AS title,
      "rawJson"->>'indutyCtgryNm' AS indutyCtgryNm,
      "rawJson"->>'pubPrcrmntClsfcNm' AS pubPrcrmntClsfcNm,
      "rawJson"->>'pubPrcrmntLrgClsfcNm' AS pubPrcrmntLrgClsfcNm,
      "rawJson"->>'pubPrcrmntMidClsfcNm' AS pubPrcrmntMidClsfcNm,
      "rawJson"->>'dtlsBidYn' AS dtlsBidYn
    FROM "Announcement"
    WHERE "subCategories" IS NULL OR array_length("subCategories",1) IS NULL
    LIMIT 3
  `);
  for (const r of r2.rows) console.log(JSON.stringify(r, null, 2).slice(0, 800));

  process.stdout.write("\n"); console.log("\n=== 3. AnnouncementChgHst rawJson 실제 필드 keys ===");
  const r3 = await pool.query(`
    SELECT "annId", "rawJson" FROM "AnnouncementChgHst" LIMIT 3
  `);
  for (const r of r3.rows) {
    const raw = r.rawJson as Record<string, unknown> | null;
    const keys = raw ? Object.keys(raw) : [];
    process.stdout.write("\n"); console.log(`  annId=${r.annId} rawJson keys:`, keys.slice(0, 20).join(", "));
    if (raw) console.log(`  샘플:`, JSON.stringify(raw, null, 2).slice(0, 600));
  }

  process.stdout.write("\n"); console.log("\n=== 4. sucsfbidLwltRate가 0인 공고의 rawJson에 있는가? ===");
  const r4 = await pool.query(`
    SELECT "konepsId",
      "rawJson"->>'sucsfbidLwltRate' AS rawLwlt,
      "rawJson"->>'bidNtceNm' AS title
    FROM "Announcement"
    WHERE "sucsfbidLwltRate" = 0 OR "sucsfbidLwltRate" IS NULL
    LIMIT 5
  `);
  process.stdout.write("\n"); console.log(JSON.stringify(r4.rows, null, 2));
  const countRawLwlt = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE "rawJson" ? 'sucsfbidLwltRate' AND "rawJson"->>'sucsfbidLwltRate' != '')::bigint AS raw_has,
      COUNT(*) FILTER (WHERE "sucsfbidLwltRate" > 0)::bigint AS col_has,
      COUNT(*)::bigint AS total
    FROM "Announcement"
  `);
  process.stdout.write("\n"); console.log("sucsfbidLwltRate: raw_has vs col_has:", countRawLwlt.rows[0]);

  process.stdout.write("\n"); console.log("\n=== 5. Announcement rawJson 샘플 keys (공사/용역/물품 각각) ===");
  for (const cat of ["공사", "용역", "물품"]) {
    const s = await pool.query(`
      SELECT "rawJson" FROM "Announcement" WHERE "category" LIKE $1 LIMIT 1
    `, [`%${cat}%`]);
    if (s.rows[0]?.rawJson) {
      const keys = Object.keys(s.rows[0].rawJson as Record<string, unknown>);
      process.stdout.write("\n"); console.log(`  [${cat}] rawJson keys (${keys.length}):`, keys.join(", "));
    }
  }

  await pool.end();
})();

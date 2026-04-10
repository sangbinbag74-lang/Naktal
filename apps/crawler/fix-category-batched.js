/**
 * Announcement.category 배치 업데이트
 * rawJson->>'pubPrcrmntMidClsfcNm' 또는 'pubPrcrmntLrgClsfcNm' 으로 교체
 * 5000건씩 처리 → statement_timeout 회피
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

function loadDatabaseUrl() {
  const envPath = path.resolve(__dirname, "../../.env");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DATABASE_URL" && val && !val.includes("[YOUR-PASSWORD]")) return val;
    }
  } catch (e) { console.error(".env 읽기 실패:", e.message); }
  return process.env.DATABASE_URL;
}

async function run() {
  const dbUrl = loadDatabaseUrl();
  if (!dbUrl) { console.error("DATABASE_URL 없음"); process.exit(1); }

  const pool = new Pool({ connectionString: dbUrl, max: 2 });

  // 업데이트 전 현황
  {
    const { rows } = await pool.query(`
      SELECT category, COUNT(*) AS cnt
      FROM "Announcement"
      GROUP BY category
      ORDER BY cnt DESC
      LIMIT 20
    `);
    console.log("=== 업데이트 전 category 분포 ===");
    for (const r of rows) console.log(` ${r.category}: ${r.cnt}건`);
  }

  const NT_KINDS = ["등록공고", "재공고", "취소공고", "변경공고", "긴급공고", "test"];
  const placeholder = NT_KINDS.map((_, i) => `$${i + 1}`).join(", ");

  // 업데이트 가능한 대상: rawJson에 pubPrcrmntMidClsfcNm 또는 pubPrcrmntLrgClsfcNm이 있는 것
  {
    const { rows: [{ fixable }] } = await pool.query(
      `SELECT COUNT(*) AS fixable FROM "Announcement"
       WHERE category IN (${placeholder})
         AND (
           NULLIF(TRIM("rawJson"->>'pubPrcrmntMidClsfcNm'), '') IS NOT NULL
           OR NULLIF(TRIM("rawJson"->>'pubPrcrmntLrgClsfcNm'), '') IS NOT NULL
         )`,
      NT_KINDS
    );
    const { rows: [{ unfixable }] } = await pool.query(
      `SELECT COUNT(*) AS unfixable FROM "Announcement"
       WHERE category IN (${placeholder})
         AND NULLIF(TRIM("rawJson"->>'pubPrcrmntMidClsfcNm'), '') IS NULL
         AND NULLIF(TRIM("rawJson"->>'pubPrcrmntLrgClsfcNm'), '') IS NULL`,
      NT_KINDS
    );
    console.log(`\n수정 가능: ${fixable}건, 수정 불가(rawJson 값 없음): ${unfixable}건`);
  }

  // 배치 업데이트 — OFFSET 0 유지 (업데이트된 건은 WHERE에서 자동 제외)
  const BATCH = 5000;
  let totalUpdated = 0;

  while (true) {
    const client = await pool.connect();
    let updated = 0;
    try {
      await client.query("SET statement_timeout = '90s'");

      const result = await client.query(`
        UPDATE "Announcement"
        SET category = COALESCE(
          NULLIF(TRIM("rawJson"->>'pubPrcrmntMidClsfcNm'), ''),
          NULLIF(TRIM("rawJson"->>'pubPrcrmntLrgClsfcNm'), ''),
          category
        )
        WHERE id IN (
          SELECT id FROM "Announcement"
          WHERE category IN (${placeholder})
            AND (
              NULLIF(TRIM("rawJson"->>'pubPrcrmntMidClsfcNm'), '') IS NOT NULL
              OR NULLIF(TRIM("rawJson"->>'pubPrcrmntLrgClsfcNm'), '') IS NOT NULL
            )
          ORDER BY id
          LIMIT ${BATCH}
        )
      `, NT_KINDS);

      updated = result.rowCount ?? 0;
      totalUpdated += updated;
      console.log(`배치: ${updated}건 업데이트 (누적 ${totalUpdated}건)`);
    } finally {
      client.release();
    }

    if (updated === 0) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n업데이트 완료: 총 ${totalUpdated}건`);

  // 업데이트 후 현황
  {
    const { rows } = await pool.query(`
      SELECT category, COUNT(*) AS cnt
      FROM "Announcement"
      GROUP BY category
      ORDER BY cnt DESC
      LIMIT 20
    `);
    console.log("\n=== 업데이트 후 category 분포 ===");
    for (const r of rows) console.log(` ${r.category}: ${r.cnt}건`);
  }

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });

/**
 * 롤백: fix-category-by-endpoint.js / fix-category-all.js 에서 강제로
 * "시설공사"로 바꾼 레코드들을 다시 "등록공고"로 되돌린다.
 *
 * 대상: category = '시설공사' 이면서 rawJson에 pubPrcrmntLrgClsfcNm 이 없는 것
 *       (원래부터 시설공사였던 것은 pubPrcrmntLrgClsfcNm = "시설공사" 가 rawJson에 있음)
 */
const { Pool } = require("pg");
const fs = require("fs"), path = require("path");

function getDb() {
  const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf-8");
  for (const l of env.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v && !v.includes("[YOUR-PASSWORD]")) return v;
  }
}

const pool = new Pool({ connectionString: getDb(), max: 2 });

async function run() {
  const client = await pool.connect();
  try {
    // 원래부터 시설공사였던 레코드 수 먼저 확인
    await client.query("SET statement_timeout = '30s'");
    const { rows: [orig] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '시설공사'
        AND "rawJson"->>'pubPrcrmntLrgClsfcNm' IS NOT NULL
        AND "rawJson"->>'pubPrcrmntLrgClsfcNm' != ''
    `);
    console.log("원래부터 시설공사였던 레코드(pubPrcrmntLrg 있음):", orig.cnt);

    // 우리가 강제 변경한 레코드 수 확인
    const { rows: [forced] } = await client.query(`
      SELECT COUNT(*) AS cnt FROM "Announcement"
      WHERE category = '시설공사'
        AND ("rawJson"->>'pubPrcrmntLrgClsfcNm' IS NULL OR "rawJson"->>'pubPrcrmntLrgClsfcNm' = '')
    `);
    console.log("강제 변경된 시설공사 레코드(pubPrcrmntLrg 없음):", forced.cnt, "→ 이것들을 롤백");

    // 롤백: pubPrcrmntLrg 없는 시설공사 → 등록공고
    let total = 0;
    while (true) {
      await client.query("SET statement_timeout = '120s'");
      const r = await client.query(`
        UPDATE "Announcement"
        SET category = '등록공고'
        WHERE id IN (
          SELECT id FROM "Announcement"
          WHERE category = '시설공사'
            AND ("rawJson"->>'pubPrcrmntLrgClsfcNm' IS NULL
              OR "rawJson"->>'pubPrcrmntLrgClsfcNm' = '')
          LIMIT 5000
        )
      `);
      total += r.rowCount;
      process.stdout.write(`  ${total}건 롤백 완료\r`);
      if (r.rowCount === 0) break;
    }
    console.log(`\n시설공사 → 등록공고 롤백: 총 ${total}건`);

    // 확인
    await client.query("SET statement_timeout = '30s'");
    const { rows: [check] } = await client.query(`SELECT COUNT(*) AS cnt FROM "Announcement" WHERE category = '시설공사'`);
    console.log("롤백 후 시설공사 수:", check.cnt, "(이게 원래부터 시설공사였던 것들)");

    const { rows: [check2] } = await client.query(`SELECT COUNT(*) AS cnt FROM "Announcement" WHERE category = '등록공고'`);
    console.log("롤백 후 등록공고 수:", check2.cnt);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });

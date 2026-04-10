/**
 * 남은 252K 등록공고의 성격 파악
 * - Cnstwk (mainCnsttyNm 키 있음, 값 없음) → 시설공사 fallback
 * - Servc (srvceDivNm 또는 pubPrcrmntLrgClsfcNm 있음) → 용역/해당분류
 * - Thng (prdctQty 또는 prdctClsfcNo 있음) → 물품
 * - 나머지 → 그대로 등록공고
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
(async () => {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '0'");

    // 1. mainCnsttyNm 키가 있는 등록공고 (Cnstwk → 시설공사 fallback)
    const { rows: [r1] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category = '등록공고'
        AND "rawJson" ? 'mainCnsttyNm'
    `);
    console.log("등록공고 중 mainCnsttyNm 키 있음 (Cnstwk):", r1.c);

    // 2. srvceDivNm 있는 등록공고 (Servc)
    const { rows: [r2] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category = '등록공고'
        AND "rawJson" ? 'srvceDivNm'
    `);
    console.log("등록공고 중 srvceDivNm 있음 (Servc):", r2.c);

    // 3. pubPrcrmntLrgClsfcNm 있는 등록공고 (Servc pubPrcrmnt)
    const { rows: [r3] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category = '등록공고'
        AND "rawJson" ? 'pubPrcrmntLrgClsfcNm'
        AND "rawJson"->>'pubPrcrmntLrgClsfcNm' != ''
    `);
    console.log("등록공고 중 pubPrcrmntLrg 있음:", r3.c);

    // 4. pubPrcrmntMidClsfcNm 분포 (있는 등록공고)
    const { rows: r4 } = await client.query(`
      SELECT "rawJson"->>'pubPrcrmntMidClsfcNm' AS mid, COUNT(*) AS cnt
      FROM "Announcement"
      WHERE category = '등록공고'
        AND "rawJson" ? 'pubPrcrmntMidClsfcNm'
        AND "rawJson"->>'pubPrcrmntMidClsfcNm' != ''
      GROUP BY 1 ORDER BY cnt DESC LIMIT 20
    `);
    console.log("\npubPrcrmntMid 분포 (등록공고):");
    for (const r of r4) console.log(`  "${r.mid}": ${r.cnt}건`);

    // 5. prdctClsfcNo 있는 등록공고 (Thng)
    const { rows: [r5] } = await client.query(`
      SELECT COUNT(*) AS c FROM "Announcement"
      WHERE category = '등록공고'
        AND "rawJson" ? 'prdctClsfcNo'
    `);
    console.log("\n등록공고 중 prdctClsfcNo 있음 (Thng):", r5.c);

    // 총계
    const { rows: [tot] } = await client.query(`SELECT COUNT(*) AS c FROM "Announcement" WHERE category='등록공고'`);
    console.log("\n총 등록공고:", tot.c);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });

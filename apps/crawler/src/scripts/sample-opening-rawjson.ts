import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
  }
}
const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) { console.error("no db url"); process.exit(1); }
const pool = new Pool({ connectionString: url });

(async () => {
  // 최근 1년 BidOpeningDetail 5건 샘플 (rawJson에 참여자 list 있는지 확인)
  const r = await pool.query(`
    SELECT "annId",
           jsonb_array_length("rawJson"::jsonb) AS row_count,
           "rawJson"::jsonb AS rawJson
    FROM "BidOpeningDetail"
    WHERE "openingDate" > NOW() - INTERVAL '3 months'
      AND jsonb_array_length("rawJson"::jsonb) > 0
      AND "rawJson"::text ILIKE '%opengCorpInfo%'
    ORDER BY random()
    LIMIT 3
  `);
  for (const row of r.rows) {
    console.log("=".repeat(80));
    console.log(`annId=${row.annId} row_count=${row.row_count}`);
    const arr = row.rawjson;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      const corp = String(item.opengCorpInfo ?? "");
      console.log(`\n--- row[${i}] rbidNo=${item.rbidNo} prtcptCnum=${item.prtcptCnum} progrsDivCdNm=${item.progrsDivCdNm}`);
      if (corp) {
        // 첫 1500자만
        console.log("opengCorpInfo (first 1500):");
        console.log(corp.slice(0, 1500));
        // 구분자 패턴 분석
        console.log(`-- length=${corp.length}, contains '^'=${corp.includes("^")}, contains '|'=${corp.includes("|")}, contains '@'=${corp.includes("@")}, contains newline=${corp.includes("\n")}`);
      }
    }
  }
  await pool.end();
})();

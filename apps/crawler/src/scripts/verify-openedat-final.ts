import { Pool } from "pg";
import * as fs from "fs"; import * as path from "path";

function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    const m = v.match(/^"([^"]*)"|^'([^']*)'/);
    if (m) v = (m[1] ?? m[2]) as string;
    if (k === "DATABASE_URL" && v) return v;
  }
  throw new Error("no db");
}

(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1 });
  const c = await pool.connect();

  console.log("=== BidResult.openedAt 최종 검증 ===\n");

  const r1 = await c.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT("openedAt")::bigint AS filled,
      COUNT(*) FILTER (WHERE "openedAt" IS NULL)::bigint AS missing
    FROM "BidResult"
  `);
  const t = Number(r1.rows[0].total);
  const f = Number(r1.rows[0].filled);
  const miss = Number(r1.rows[0].missing);
  console.log(`전체: ${t.toLocaleString()}`);
  console.log(`채움: ${f.toLocaleString()} (${(f/t*100).toFixed(4)}%)`);
  console.log(`결측: ${miss.toLocaleString()} (${(miss/t*100).toFixed(4)}%)\n`);

  console.log("=== 표본 10건 (실제 openedAt 값 + annId) ===\n");
  const r2 = await c.query(`
    SELECT "annId", "openedAt", "createdAt"
    FROM "BidResult"
    WHERE "openedAt" IS NOT NULL
    ORDER BY random()
    LIMIT 10
  `);
  for (const row of r2.rows) {
    const dt = new Date(row.openedAt).toISOString();
    console.log(`${row.annId}\t${dt}`);
  }

  console.log("\n=== 결측 22건 분포 (annId prefix별) ===\n");
  const r3 = await c.query(`
    SELECT
      LEFT("annId", 4) AS year_prefix,
      COUNT(*)::int AS cnt
    FROM "BidResult"
    WHERE "openedAt" IS NULL
    GROUP BY 1
    ORDER BY cnt DESC
  `);
  for (const row of r3.rows) {
    console.log(`${row.year_prefix}\t${row.cnt}`);
  }

  console.log("\n=== 결측 22건 샘플 5건 ===\n");
  const r4 = await c.query(`
    SELECT "annId", "createdAt"
    FROM "BidResult"
    WHERE "openedAt" IS NULL
    LIMIT 5
  `);
  for (const row of r4.rows) {
    console.log(`${row.annId}\tcreatedAt=${new Date(row.createdAt).toISOString()}`);
  }

  console.log("\n=== openedAt 형식 검증 (연도 분포) ===\n");
  const r5 = await c.query(`
    SELECT
      EXTRACT(YEAR FROM "openedAt")::int AS yr,
      COUNT(*)::bigint AS cnt
    FROM "BidResult"
    WHERE "openedAt" IS NOT NULL
    GROUP BY 1
    ORDER BY yr
  `);
  for (const row of r5.rows) {
    console.log(`${row.yr}\t${Number(row.cnt).toLocaleString()}`);
  }

  c.release();
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });

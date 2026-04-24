/**
 * AnnouncementChgHst COUNT per annId → chg_count.csv
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
import { to as copyTo } from "pg-copy-streams";
import { pipeline } from "stream/promises";

function loadDatabaseUrl(): string {
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

const OUT_DIR = path.resolve(__dirname, "../../../../apps/ml/data/raw");
const OUT = path.join(OUT_DIR, "chg_count.csv");

(async () => {
  const pool = new Pool({ connectionString: loadDatabaseUrl(), statement_timeout: 0 });
  const client = await pool.connect();
  try {
    console.log("chg_count 덤프 시작 →", OUT);
    const t0 = Date.now();
    const readStream = client.query(
      copyTo(
        `COPY (SELECT "annId", COUNT(*)::int AS chg_count FROM "AnnouncementChgHst" GROUP BY "annId") TO STDOUT WITH CSV HEADER`,
      ),
    );
    const writeStream = fs.createWriteStream(OUT);
    await pipeline(readStream, writeStream);
    const size = fs.statSync(OUT).size;
    console.log(`✅ ${(size / 1024 / 1024).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  } finally {
    client.release();
    await pool.end();
  }
})();

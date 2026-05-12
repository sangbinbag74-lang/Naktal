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
  const r = await pool.query(`SELECT id, "konepsId", "orgName", title, deadline, "rawJson" FROM "AnnouncementActive" ORDER BY deadline ASC LIMIT 5`);
  for (const row of r.rows) {
    const raw = row.rawJson || {};
    const hasTl = ['rcptBgnDt','bidPrtcptQlfctRgstDdln','bidClseDt','opengDt','opengTm'].filter(k => raw[k]).join(',');
    console.log(`KONEPS=${row.konepsId} ORG=${row.orgName} TL=[${hasTl}] DDL=${row.deadline}`);
  }
  await pool.end();
})();

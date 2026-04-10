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
const pool = new Pool({ connectionString: getDb(), max: 1 });
pool.query(`SELECT category, COUNT(*) AS cnt FROM "Announcement" WHERE category IN ('등록공고','시설공사') GROUP BY 1 ORDER BY cnt DESC`).then(r => {
  for (const row of r.rows) console.log(row.category, row.cnt);
  pool.end();
}).catch(e => { console.error(e.message); process.exit(1); });

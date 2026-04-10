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
  // 미매칭 BidResult annId 샘플
  const { rows: unmatched } = await pool.query(`
    SELECT b."annId" FROM "BidResult" b
    LEFT JOIN "Announcement" a ON a."konepsId" = b."annId"
    WHERE a.id IS NULL
    LIMIT 5
  `);
  console.log("매칭 안 되는 BidResult.annId 샘플:");
  for (const r of unmatched) console.log(" ", r.annId);

  // 매칭되는 BidResult annId 샘플
  const { rows: matched } = await pool.query(`
    SELECT b."annId", a."konepsId" FROM "BidResult" b
    JOIN "Announcement" a ON a."konepsId" = b."annId"
    LIMIT 5
  `);
  console.log("\n매칭 되는 BidResult.annId 샘플:");
  for (const r of matched) console.log(` annId=${r.annId} konepsId=${r.konepsId}`);

  // Announcement.konepsId 샘플
  const { rows: ann } = await pool.query(`
    SELECT "konepsId" FROM "Announcement" LIMIT 5
  `);
  console.log("\nAnnouncement.konepsId 샘플:");
  for (const r of ann) console.log(" ", r.konepsId);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
let dbUrl = "";
const txt = fs.readFileSync(path.resolve(__dirname, "../../../../.env"), "utf-8");
for (const l of txt.split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (k === "DATABASE_URL") dbUrl = v;
}
const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });
(async () => {
  const r = await pool.query(`SELECT "rawJson"->'ciblAplYn' AS jval, "ciblAplYn" AS col FROM "Announcement" WHERE "ciblAplYn" = '' LIMIT 5`);
  for (const row of r.rows) console.log(`col='${row.col}' jval=${JSON.stringify(row.jval)}`);
  await pool.end();
})();

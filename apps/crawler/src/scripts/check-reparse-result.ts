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
  const r = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "sucsfbidLwltRate" > 0)::bigint AS sucs_filled,
      COUNT(*) FILTER (WHERE "bidNtceDtlUrl" != '')::bigint AS url_filled,
      COUNT(*) FILTER (WHERE "ntceInsttOfclTelNo" != '')::bigint AS tel_filled,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl_filled,
      COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn" != '')::bigint AS mtlty_filled
    FROM "Announcement"
  `);
  const row = r.rows[0];
  const total = Number(row.total);
  console.log(`=== Reparse 후 5필드 채움률 ===`);
  console.log(`총 Announcement: ${total.toLocaleString()}`);
  console.log("");
  const fields = [
    { name: "sucsfbidLwltRate", count: Number(row.sucs_filled) },
    { name: "bidNtceDtlUrl",    count: Number(row.url_filled) },
    { name: "ntceInsttOfclTelNo", count: Number(row.tel_filled) },
    { name: "ciblAplYn",        count: Number(row.cibl_filled) },
    { name: "mtltyAdvcPsblYn",  count: Number(row.mtlty_filled) },
  ];
  for (const f of fields) {
    const pct = (100 * f.count / total).toFixed(2);
    console.log(`  ${f.name.padEnd(22)} : ${f.count.toLocaleString().padStart(10)} / ${total.toLocaleString()} (${pct}%)`);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

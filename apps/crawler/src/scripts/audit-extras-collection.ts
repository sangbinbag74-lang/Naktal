import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
function loadDb() {
  const env = path.resolve(__dirname, "../../../../.env");
  const c = fs.readFileSync(env, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "DATABASE_URL" && v) return v;
  }
  throw new Error();
}
(async () => {
  const pool = new Pool({ connectionString: loadDb(), max: 1, statement_timeout: 60000 });
  const c = await pool.connect();

  console.log("=== Announcement 핵심 필드 채움율 ===");
  const r1 = await c.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE array_length("subCategories", 1) > 0)::bigint AS subcat_filled,
      COUNT(*) FILTER (WHERE "bsisAmt" > 0)::bigint AS bsis_filled,
      COUNT(*) FILTER (WHERE "aValueTotal" > 0)::bigint AS aval_filled,
      COUNT(*) FILTER (WHERE "sucsfbidLwltRate" > 0)::bigint AS llrate_filled,
      COUNT(*) FILTER (WHERE "ciblAplYn" != '')::bigint AS cibl_filled,
      COUNT(*) FILTER (WHERE "mtltyAdvcPsblYn" != '')::bigint AS mtlty_filled,
      COUNT(*) FILTER (WHERE "bidNtceDtlUrl" != '')::bigint AS url_filled
    FROM "Announcement"
  `);
  const r = r1.rows[0];
  const pct = (n: any) => `${((Number(n) / Number(r.total)) * 100).toFixed(1)}%`;
  console.log(`  total            : ${Number(r.total).toLocaleString()}`);
  console.log(`  subCategories    : ${Number(r.subcat_filled).toLocaleString()} (${pct(r.subcat_filled)})`);
  console.log(`  bsisAmt          : ${Number(r.bsis_filled).toLocaleString()} (${pct(r.bsis_filled)})`);
  console.log(`  aValueTotal      : ${Number(r.aval_filled).toLocaleString()} (${pct(r.aval_filled)})`);
  console.log(`  sucsfbidLwltRate : ${Number(r.llrate_filled).toLocaleString()} (${pct(r.llrate_filled)})`);
  console.log(`  ciblAplYn        : ${Number(r.cibl_filled).toLocaleString()} (${pct(r.cibl_filled)})`);
  console.log(`  mtltyAdvcPsblYn  : ${Number(r.mtlty_filled).toLocaleString()} (${pct(r.mtlty_filled)})`);
  console.log(`  bidNtceDtlUrl    : ${Number(r.url_filled).toLocaleString()} (${pct(r.url_filled)})`);

  console.log("\n=== subCategories 표본 5건 ===");
  const r2 = await c.query(`SELECT "konepsId", "subCategories", "category" FROM "Announcement" WHERE array_length("subCategories", 1) > 0 ORDER BY random() LIMIT 5`);
  for (const x of r2.rows) console.log(`  ${x.konepsId} ${x.category} -> [${x.subCategories.join(", ")}]`);

  console.log("\n=== bsisAmt + aValueTotal 표본 5건 ===");
  const r3 = await c.query(`SELECT "konepsId", "bsisAmt", "aValueTotal", "title" FROM "Announcement" WHERE "bsisAmt" > 0 AND "aValueTotal" > 0 ORDER BY random() LIMIT 5`);
  for (const x of r3.rows) console.log(`  ${x.konepsId} bsis=${Number(x.bsisAmt).toLocaleString()} aVal=${Number(x.aValueTotal).toLocaleString()} | ${x.title?.slice(0,50)}`);

  console.log("\n=== AnnouncementChgHst / PreStdrd / Frgcpt 행수 ===");
  const r4 = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM "AnnouncementChgHst")::bigint AS chghst,
      (SELECT COUNT(*) FROM "AnnouncementChgHst" WHERE "chgItemNm" IS NOT NULL AND "chgItemNm" != '')::bigint AS chghst_item,
      (SELECT COUNT(*) FROM "PreStdrd")::bigint AS prestdrd
  `);
  const r4r = r4.rows[0];
  console.log(`  AnnouncementChgHst         : ${Number(r4r.chghst).toLocaleString()}`);
  console.log(`  AnnouncementChgHst.chgItemNm 채움 : ${Number(r4r.chghst_item).toLocaleString()}`);
  console.log(`  PreStdrd                   : ${Number(r4r.prestdrd).toLocaleString()}`);

  console.log("\n=== AnnouncementChgHst 표본 5건 ===");
  const r5 = await c.query(`SELECT "annId", "chgItemNm", "chgDate" FROM "AnnouncementChgHst" WHERE "chgItemNm" IS NOT NULL ORDER BY random() LIMIT 5`);
  for (const x of r5.rows) console.log(`  ${x.annId} ${x.chgDate?.toISOString?.().slice(0,10)} | ${x.chgItemNm?.slice(0,60)}`);

  c.release(); await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

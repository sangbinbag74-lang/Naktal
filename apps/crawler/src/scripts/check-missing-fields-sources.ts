/**
 * 결측 필드 4개의 실제 데이터 소스 확인
 *   1. Announcement.prtcptPsblRgnNm / jntcontrctDutyRgnNm / ciblAplYn / mtltyAdvcPsblYn
 *      → rawJson 에 있으면 reparse 가능
 *   2. PreStdrd.bfSpecRgstNm / ntceInsttNm → rawJson 확인
 *   3. BidOpeningDetail.sucsfbidRate → rawJson 에 있는지
 *   4. BidResult.openedAt → rawJson 에 있는지
 */
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

function loadDbUrl(): string {
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

(async () => {
  const pool = new Pool({ connectionString: loadDbUrl(), statement_timeout: 60000 });

  process.stdout.write("=== 1. Announcement rawJson 에 지역/참가 관련 필드 ===\n");
  const a = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE "rawJson"->>'prtcptPsblRgnNm' != '')::bigint AS r1,
           COUNT(*) FILTER (WHERE "rawJson"->>'jntcontrctDutyRgnNm' != '')::bigint AS r2,
           COUNT(*) FILTER (WHERE "rawJson"->>'ciblAplYn' != '')::bigint AS c1,
           COUNT(*) FILTER (WHERE "rawJson"->>'mtltyAdvcPsblYn' != '')::bigint AS m1,
           COUNT(*)::bigint AS total
    FROM "Announcement" TABLESAMPLE BERNOULLI (1)
  `);
  process.stdout.write(JSON.stringify(a.rows[0]) + "\n");

  process.stdout.write("\n샘플 (1건):\n");
  const a2 = await pool.query(`
    SELECT "konepsId",
      "rawJson"->>'prtcptPsblRgnNm' AS prtcptPsblRgnNm,
      "rawJson"->>'jntcontrctDutyRgnNm' AS jntcontrctDutyRgnNm,
      "rawJson"->>'ciblAplYn' AS ciblAplYn,
      "rawJson"->>'mtltyAdvcPsblYn' AS mtltyAdvcPsblYn
    FROM "Announcement"
    WHERE "rawJson"->>'prtcptPsblRgnNm' != '' LIMIT 3
  `);
  process.stdout.write(JSON.stringify(a2.rows, null, 2) + "\n");

  process.stdout.write("\n=== 2. PreStdrd rawJson 에 bfSpecRgstNm/ntceInsttNm ===\n");
  const p = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE "rawJson"->>'bfSpecRgstNm' != '')::bigint AS nm,
      COUNT(*) FILTER (WHERE "rawJson"->>'ntceInsttNm' != '')::bigint AS inst,
      COUNT(*)::bigint AS total
    FROM "PreStdrd" TABLESAMPLE BERNOULLI (1)
  `);
  process.stdout.write(JSON.stringify(p.rows[0]) + "\n");
  const p2 = await pool.query(`
    SELECT "rawJson"->>'bfSpecRgstNo' AS no, "rawJson"->>'bfSpecRgstNm' AS nm,
           "rawJson"->>'ntceInsttNm' AS inst
    FROM "PreStdrd" LIMIT 3
  `);
  process.stdout.write("샘플:\n" + JSON.stringify(p2.rows, null, 2) + "\n");

  process.stdout.write("\n=== 3. BidOpeningDetail rawJson 에 sucsfbidLwltRate / sucsfbidRate ===\n");
  const o = await pool.query(`
    SELECT "rawJson" FROM "BidOpeningDetail"
    WHERE "rawJson" IS NOT NULL AND jsonb_typeof("rawJson") = 'array'
      AND jsonb_array_length("rawJson") > 0
    LIMIT 3
  `);
  for (const r of o.rows) {
    const raw = r.rawJson as unknown[];
    const first = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
    const rateKeys = Object.keys(first ?? {}).filter((k) => /rate|lwlt|sucs/i.test(k));
    process.stdout.write(`  rate 관련 keys: ${rateKeys.join(", ")}\n`);
    for (const k of rateKeys) process.stdout.write(`    ${k}: ${JSON.stringify((first as Record<string, unknown>)[k])}\n`);
  }

  process.stdout.write("\n=== 4. BidResult rawJson 에 openedAt / rlOpengDt ===\n");
  const b = await pool.query(`SELECT "rawJson" FROM "BidResult" WHERE "rawJson" IS NOT NULL LIMIT 3`);
  for (const r of b.rows) {
    const raw = r.rawJson as Record<string, unknown>;
    const dtKeys = Object.keys(raw ?? {}).filter((k) => /dt|date|ope/i.test(k));
    process.stdout.write(`  date 관련 keys: ${dtKeys.join(", ")}\n`);
    for (const k of dtKeys) process.stdout.write(`    ${k}: ${JSON.stringify(raw[k])}\n`);
  }

  await pool.end();
})();

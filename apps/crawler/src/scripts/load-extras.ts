/**
 * 옵션 A 재수집 — 보조 9 API 3단계 적재 (모집·분석·적재 3단계 분리)
 *
 * - .recollect-cache/{ym}-extras-audit.json 강제 검증 (decision === GO 또는 EMPTY)
 * - 13 op JSONL 읽고 batchUpsert* 호출 (idempotent UPSERT)
 * - 적재 후 표본 5건 SELECT → 값 검증 출력
 *
 * 실행: ts-node src/scripts/load-extras.ts --ym 200703
 */

import * as path from "path";
import * as fs from "fs";

(function loadEnv() {
  const candidates = [
    path.resolve(__dirname, "../../../web/.env.local"),
    path.resolve(__dirname, "../../../../.env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const c = fs.readFileSync(p, "utf-8");
    for (const l of c.split("\n")) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!k) continue;
      if (v.includes("[YOUR-PASSWORD]") || v.includes("your-project")) continue;
      if (!process.env[k]) process.env[k] = v;
    }
  }
})();

import { Pool } from "pg";
import {
  batchUpsertLicenseLimit,
  batchUpsertBsisAmount,
  batchUpsertCalclA,
  batchInsertChgHst,
  batchUpsertFrgcpt,
  batchInsertPreStdrd,
  ensurePreStdrdTable,
  type LicenseLimitItem,
  type BsisAmountItem,
  type CalclAItem,
  type ChgHstItem,
  type FrgcptItem,
  type PreStdrdItem,
} from "../bulk-import-extras-v2";

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");

function parseArgs() {
  const args = process.argv.slice(2);
  let ym = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ym" && args[i + 1]) ym = args[i + 1];
  }
  if (!/^\d{6}$/.test(ym)) { console.error("Usage: --ym YYYYMM"); process.exit(1); }
  return { ym };
}

function readJSONL(fp: string): any[] {
  if (!fs.existsSync(fp)) return [];
  const txt = fs.readFileSync(fp, "utf-8");
  const rows: any[] = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

function loadOp(ym: string, op: string): any[] {
  return readJSONL(path.join(CACHE_DIR, `${ym}-extras-${op}.jsonl`)).map(({ __op, ...rest }) => rest);
}

(async () => {
  const { ym } = parseArgs();

  const auditFp = path.join(CACHE_DIR, `${ym}-extras-audit.json`);
  if (!fs.existsSync(auditFp)) {
    console.error(`extras-audit JSON 없음: ${auditFp}`);
    console.error(`먼저 ts-node src/scripts/audit-extras.ts --ym ${ym} 실행`);
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(auditFp, "utf-8"));
  if (audit.decision !== "GO" && audit.decision !== "EMPTY") {
    console.error(`extras-audit decision=${audit.decision} (GO/EMPTY 아님) — 적재 거부`);
    process.exit(3);
  }
  console.log(`[load-extras] ym=${ym} | audit decision=${audit.decision}`);

  const lic = loadOp(ym, "getBidPblancListInfoLicenseLimit") as LicenseLimitItem[];
  const cns = loadOp(ym, "getBidPblancListInfoCnstwkBsisAmount") as BsisAmountItem[];
  const svc = loadOp(ym, "getBidPblancListInfoServcBsisAmount") as BsisAmountItem[];
  const thn = loadOp(ym, "getBidPblancListInfoThngBsisAmount") as BsisAmountItem[];
  const cal = loadOp(ym, "getBidPblancListBidPrceCalclAInfo") as CalclAItem[];
  const chgC = loadOp(ym, "getBidPblancListInfoChgHstryCnstwk") as ChgHstItem[];
  const chgS = loadOp(ym, "getBidPblancListInfoChgHstryServc") as ChgHstItem[];
  const chgT = loadOp(ym, "getBidPblancListInfoChgHstryThng") as ChgHstItem[];
  const frg = loadOp(ym, "getBidPblancListInfoFrgcpt") as FrgcptItem[];
  const preC = loadOp(ym, "getPublicPrcureThngInfoCnstwk") as PreStdrdItem[];
  const preS = loadOp(ym, "getPublicPrcureThngInfoServc") as PreStdrdItem[];
  const preT = loadOp(ym, "getPublicPrcureThngInfoThng") as PreStdrdItem[];
  const preF = loadOp(ym, "getPublicPrcureThngInfoFrgcpt") as PreStdrdItem[];
  const preAll = [...preC, ...preS, ...preT, ...preF];

  console.log(`  JSONL 읽기: Lic=${lic.length} Cns=${cns.length} Svc=${svc.length} Thn=${thn.length} Cal=${cal.length} ChgC=${chgC.length} ChgS=${chgS.length} ChgT=${chgT.length} Frg=${frg.length} Pre=${preAll.length}`);

  const dbUrl = process.env.DATABASE_URL!;
  if (!dbUrl) { console.error("DATABASE_URL 없음"); process.exit(1); }
  const pool = new Pool({ connectionString: dbUrl, max: 1, statement_timeout: 0 });

  const t0 = Date.now();
  const client = await pool.connect();
  let rLic = 0, rCns = 0, rSvc = 0, rThn = 0, rCal = 0, rC = 0, rS = 0, rT = 0, rFrg = 0, rPre = 0;
  try {
    await ensurePreStdrdTable(client);

    if (frg.length > 0) {
      try { rFrg = await batchUpsertFrgcpt(frg, client); }
      catch (e) { console.error(`    [Frgcpt] 실패 (skip): ${(e as Error).message.slice(0, 100)}`); }
    }
    rLic = await batchUpsertLicenseLimit(lic, client);
    rCns = await batchUpsertBsisAmount(cns, client);
    rSvc = await batchUpsertBsisAmount(svc, client);
    rThn = await batchUpsertBsisAmount(thn, client);
    rCal = await batchUpsertCalclA(cal, client);
    rC = await batchInsertChgHst(chgC, client);
    rS = await batchInsertChgHst(chgS, client);
    rT = await batchInsertChgHst(chgT, client);
    rPre = await batchInsertPreStdrd(preAll, client);
  } finally {
    client.release();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== 적재 완료 (${elapsed}s) ===`);
  console.log(`  Lic:${rLic} Cns:${rCns} Svc:${rSvc} Thn:${rThn} Cal:${rCal} ChgC:${rC} ChgS:${rS} ChgT:${rT} Frg:${rFrg} Pre:${rPre}`);

  // 적재 후 표본 SELECT (subCategories / aValueTotal / bsisAmt 검증)
  const sampleIds = [
    ...lic.slice(0, 3).map((x) => x.bidNtceNo).filter(Boolean),
    ...cns.slice(0, 2).map((x) => x.bidNtceNo).filter(Boolean),
  ].filter((x): x is string => !!x);
  if (sampleIds.length > 0) {
    const c2 = await pool.connect();
    try {
      const r = await c2.query(`
        SELECT "konepsId", title, "subCategories", "bsisAmt"::text AS bsis, "aValueTotal"::text AS atot
        FROM "Announcement"
        WHERE "konepsId" = ANY($1::text[])
        ORDER BY "konepsId"
        LIMIT 5
      `, [sampleIds]);
      console.log(`\n=== 적재 후 표본 SELECT (${r.rows.length}건) ===`);
      for (const row of r.rows) {
        const cats = Array.isArray(row.subCategories) ? row.subCategories.slice(0, 3).join(",") : "";
        console.log(`  ${row.konepsId} | ${String(row.title ?? "").slice(0, 25)} | cats=[${cats}] | bsis=${row.bsis} | aTotal=${row.atot}`);
      }
    } finally {
      c2.release();
    }
  }
  await pool.end();

  console.log(`\n=== extras 적재 완료 (ym=${ym}) ===`);
})().catch((e) => { console.error(e); process.exit(1); });

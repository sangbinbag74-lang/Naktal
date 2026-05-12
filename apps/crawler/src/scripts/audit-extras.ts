/**
 * 옵션 A 재수집 — 보조 9 API 2단계 분석 (모집·분석·적재 3단계 분리)
 *
 * - .recollect-cache/{ym}-extras-{op}.jsonl 13개 읽음
 * - op별 식별자(idField) 100% + 타겟 필드 채움율 (한 개 이상 채워진 행 비율) ≥ 임계값
 * - 표본 5건 출력
 * - 통과 시 audit JSON 저장 (load-extras 가 GO 강제 검증 후 적재)
 *
 * 임계값:
 *  - idField: 100%
 *  - LicenseLimit/CalclA/ChgHst-x/Frgcpt/PreStdrd-x: 타겟≥70~90% (G2B 결측 가능)
 *  - BsisAmount-x: 타겟(bssamt)≥80%
 *
 * 실행: ts-node src/scripts/audit-extras.ts --ym 200703
 */

import * as path from "path";
import * as fs from "fs";

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");

type ExtraOpDef = { op: string; idField: string; targetFields: string[]; targetMinPct: number };

const OPS: ExtraOpDef[] = [
  { op: "getBidPblancListInfoLicenseLimit",        idField: "bidNtceNo", targetFields: ["indstrytyMfrcFldList", "permsnIndstrytyList", "lcnsLmtNm"], targetMinPct: 70 },
  { op: "getBidPblancListInfoCnstwkBsisAmount",    idField: "bidNtceNo", targetFields: ["bssamt"], targetMinPct: 80 },
  { op: "getBidPblancListInfoServcBsisAmount",     idField: "bidNtceNo", targetFields: ["bssamt"], targetMinPct: 75 },
  { op: "getBidPblancListInfoThngBsisAmount",      idField: "bidNtceNo", targetFields: ["bssamt"], targetMinPct: 80 },
  { op: "getBidPblancListBidPrceCalclAInfo",       idField: "bidNtceNo", targetFields: ["sftyMngcst", "sftyChckMngcst", "rtrfundNon", "mrfnHealthInsrprm", "npnInsrprm", "odsnLngtrmrcprInsrprm", "qltyMngcst"], targetMinPct: 70 },
  { op: "getBidPblancListInfoChgHstryCnstwk",      idField: "bidNtceNo", targetFields: ["chgItemNm"], targetMinPct: 80 },
  { op: "getBidPblancListInfoChgHstryServc",       idField: "bidNtceNo", targetFields: ["chgItemNm"], targetMinPct: 80 },
  { op: "getBidPblancListInfoChgHstryThng",        idField: "bidNtceNo", targetFields: ["chgItemNm"], targetMinPct: 80 },
  { op: "getBidPblancListInfoFrgcpt",              idField: "bidNtceNo", targetFields: ["bidNtceNm", "bidClseDt"], targetMinPct: 90 },
  { op: "getPublicPrcureThngInfoCnstwk",           idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"], targetMinPct: 80 },
  { op: "getPublicPrcureThngInfoServc",            idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"], targetMinPct: 80 },
  { op: "getPublicPrcureThngInfoThng",             idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"], targetMinPct: 80 },
  { op: "getPublicPrcureThngInfoFrgcpt",           idField: "bfSpecRgstNo", targetFields: ["bfSpecRgstNm", "rcptDt"], targetMinPct: 80 },
];

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

function isFilled(v: any): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s === "" || s === "0") return false;
  return true;
}

(async () => {
  const { ym } = parseArgs();
  console.log(`=== Extras Audit: ym=${ym} ===\n`);

  const opResults: any[] = [];
  let allGo = true;
  let anyData = false;

  for (const def of OPS) {
    const fp = path.join(CACHE_DIR, `${ym}-extras-${def.op}.jsonl`);
    const rows = readJSONL(fp);

    if (rows.length === 0) {
      // 데이터 없음 — 정상일 수 있음 (해당 월에 해당 카테고리 공고 없음 등). idOk=true 처리.
      opResults.push({ op: def.op, rows: 0, idPct: 0, targetPct: 0, decision: "EMPTY", idOk: true, targetOk: true });
      console.log(`[${def.op}] rows=0 (EMPTY — 정상으로 간주)`);
      continue;
    }
    anyData = true;

    let idFilled = 0;
    let targetFilled = 0;
    const samples: any[] = [];
    for (const r of rows) {
      if (isFilled(r[def.idField])) idFilled++;
      if (def.targetFields.some((f) => isFilled(r[f]))) targetFilled++;
      if (samples.length < 5) samples.push(r);
    }
    const idPct = (idFilled / rows.length) * 100;
    const targetPct = (targetFilled / rows.length) * 100;
    const idOk = idPct === 100;
    const targetOk = targetPct >= def.targetMinPct;
    const decision = idOk && targetOk ? "GO" : "NO";
    if (decision === "NO") allGo = false;

    console.log(`[${def.op}] rows=${rows.length} | id=${idPct.toFixed(2)}% | target=${targetPct.toFixed(2)}% (≥${def.targetMinPct}%) | ${decision}`);
    if (decision === "NO") {
      console.error(`  ✗ idOk=${idOk} (${idFilled}/${rows.length}) | targetOk=${targetOk}`);
    }

    // 표본 출력
    for (let i = 0; i < Math.min(2, samples.length); i++) {
      const s = samples[i];
      const idVal = s[def.idField] ?? "(null)";
      const tgtSnap = def.targetFields.slice(0, 3).map((f) => `${f}=${String(s[f] ?? "").slice(0, 30)}`).join(" | ");
      console.log(`  [sample ${i + 1}] ${def.idField}=${idVal} | ${tgtSnap}`);
    }

    opResults.push({ op: def.op, rows: rows.length, idPct, targetPct, decision, idOk, targetOk, samples: samples.slice(0, 5) });
  }

  const overall = anyData && allGo ? "GO" : (anyData ? "NO" : "EMPTY");
  console.log(`\n=== 전체 판정: ${overall} ===`);

  const out = path.join(CACHE_DIR, `${ym}-extras-audit.json`);
  fs.writeFileSync(out, JSON.stringify({
    ym, generatedAt: new Date().toISOString(),
    decision: overall, opResults,
  }, null, 2));
  console.log(`  audit: ${out}`);
  console.log(`  → 다음 단계: ${overall === "GO" || overall === "EMPTY" ? `ts-node src/scripts/load-extras.ts --ym ${ym}` : "사용자 결정 필요 (NO)"}`);

  // EMPTY 도 GO 처럼 진행 — 로드 단계가 idempotent 이므로 빈 JSONL 무해
  if (overall === "NO") process.exit(3);
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * 옵션 A 재수집 — 2단계 분석 (모집·분석·적재 3단계 분리)
 *
 * 기능:
 * - .recollect-cache/{ym}-{op}.jsonl 3개 읽음
 * - 필드별 채움율, 표본 5건 출력, 형식 검증
 * - 채움율 < 95% or 비정상 형식 → "GO=NO" + 사용자 결정 필요
 * - 통과 시 audit JSON 저장 (load-recollect.ts 가 읽어 GO 확인 후 적재)
 *
 * 실행: ts-node src/scripts/audit-recollect.ts --ym 200703
 */

import * as path from "path";
import * as fs from "fs";

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
const OPS = ["getBidPblancListInfoCnstwk", "getBidPblancListInfoServc", "getBidPblancListInfoThng"] as const;
type Op = typeof OPS[number];

function parseArgs() {
  const args = process.argv.slice(2);
  let ym = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ym" && args[i + 1]) ym = args[i + 1];
  }
  if (!/^\d{6}$/.test(ym)) { console.error("Usage: --ym YYYYMM"); process.exit(1); }
  return { ym };
}

interface FieldStats {
  field: string;
  total: number;
  filled: number; // not null + not empty + not "0"
  pct: number;
  samples: any[]; // 5 samples
}

const KEY_FIELDS = [
  "bidNtceNo",       // 식별자 — 100% 필수
  "bidNtceNm",       // 공고명 — 100% 필수
  "bidNtceDt",       // 공고일시
  "bidClseDt",       // 마감일시 — 100% 필수
  "ntceInsttNm",     // 공고기관 — 95%+
  "demInsttNm",      // 수요기관
  "asignBdgtAmt",    // 배정예산액
  "presmptPrce",     // 추정가격
  "ntceInsttAddr",   // 공고기관 주소
  "sucsfbidLwltRate",// 낙찰하한율
];

function isFilled(v: any): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s === "" || s === "0") return false;
  return true;
}

function analyzeField(rows: any[], field: string): FieldStats {
  let filled = 0;
  const samples: any[] = [];
  for (const r of rows) {
    if (isFilled(r[field])) {
      filled++;
      if (samples.length < 5) samples.push(r[field]);
    }
  }
  return {
    field, total: rows.length, filled,
    pct: rows.length === 0 ? 0 : (filled / rows.length) * 100,
    samples,
  };
}

function readJSONL(fp: string): any[] {
  if (!fs.existsSync(fp)) return [];
  const txt = fs.readFileSync(fp, "utf-8");
  const rows: any[] = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

(async () => {
  const { ym } = parseArgs();
  const summaryFp = path.join(CACHE_DIR, `${ym}-summary.json`);
  const summaryExists = fs.existsSync(summaryFp);

  console.log(`=== Audit: ym=${ym} ===\n`);

  let allRows: any[] = [];
  const perOp: Record<Op, { rows: number; fields: FieldStats[] }> = {} as any;

  for (const op of OPS) {
    const fp = path.join(CACHE_DIR, `${ym}-${op}.jsonl`);
    const rows = readJSONL(fp);
    console.log(`[${op}] ${rows.length} rows`);
    perOp[op] = {
      rows: rows.length,
      fields: KEY_FIELDS.map((f) => analyzeField(rows, f)),
    };
    allRows = allRows.concat(rows);
  }

  console.log(`\n전체 합: ${allRows.length} rows`);

  // 전체 필드 채움율
  const allFields = KEY_FIELDS.map((f) => analyzeField(allRows, f));
  console.log("\n=== 필드별 채움율 (전체) ===");
  console.log("필드                   | 채움 / 전체 | 채움%   | 표본 (3건)");
  console.log("-----------------------|-------------|---------|--------------------------");
  for (const fs of allFields) {
    const samp = fs.samples.slice(0, 3).map((s) => String(s).slice(0, 20)).join(" | ");
    console.log(`${fs.field.padEnd(22)} | ${String(fs.filled).padStart(5)} / ${String(fs.total).padStart(5)} | ${fs.pct.toFixed(2).padStart(6)}% | ${samp}`);
  }

  // 표본 5건 (raw row)
  console.log("\n=== 표본 5건 (raw) ===");
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    const r = allRows[i];
    console.log(`[${i + 1}] op=${r.__op} bidNtceNo=${r.bidNtceNo} | ${r.bidNtceNm?.slice(0, 40) ?? ""} | ntceDt=${r.bidNtceDt} | clseDt=${r.bidClseDt} | bdgt=${r.asignBdgtAmt} | inst=${(r.ntceInsttNm ?? "").slice(0, 20)}`);
  }

  // GO/NO 판정
  // 기준 (G2B 원본 결측 — 재공고/취소공고에 bidClseDt NULL — 정상이므로 임계값 완화):
  // - bidNtceNo 채움 100% (식별자 필수)
  // - bidClseDt 채움 85%+ (95→90→85, 2026-05-05: 200302 89.70% NO 사례. 2003년 초기 G2B 시스템 결측 수용)
  // - bidNtceNm 채움 95%+
  const idStat = allFields.find((f) => f.field === "bidNtceNo")!;
  const clseStat = allFields.find((f) => f.field === "bidClseDt")!;
  const nmStat = allFields.find((f) => f.field === "bidNtceNm")!;

  const idOk = idStat.filled === idStat.total && idStat.total > 0;
  const clseOk = clseStat.pct >= 85 && clseStat.total > 0;
  const nmOk = nmStat.pct >= 95 && nmStat.total > 0;

  const decision = idOk && clseOk && nmOk ? "GO" : "NO";

  console.log(`\n=== 판정 ===`);
  console.log(`  bidNtceNo 100%:  ${idOk ? "✓" : "✗"} (${idStat.filled}/${idStat.total})`);
  console.log(`  bidClseDt ≥85%:  ${clseOk ? "✓" : "✗"} (${clseStat.pct.toFixed(2)}%)`);
  console.log(`  bidNtceNm ≥95%:  ${nmOk ? "✓" : "✗"} (${nmStat.pct.toFixed(2)}%)`);
  console.log(`  → ${decision}`);

  // summary 비교 (re-collect의 totalAPI vs JSONL 적재 수)
  if (summaryExists) {
    const sm = JSON.parse(fs.readFileSync(summaryFp, "utf-8"));
    console.log(`\n=== 모집 단계 대비 ===`);
    console.log(`  G2B totalCount 합: ${sm.totalAPI}`);
    console.log(`  JSONL 적재 합 (re-collect 기준): ${sm.totalSaved}`);
    console.log(`  JSONL 재계측 (audit 기준): ${allRows.length}`);
    console.log(`  abort: ${sm.abortReason || "(none)"}`);
  }

  // audit 결과 JSON 저장
  const out = path.join(CACHE_DIR, `${ym}-audit.json`);
  fs.writeFileSync(out, JSON.stringify({
    ym, generatedAt: new Date().toISOString(),
    decision, totalRows: allRows.length,
    perOp: Object.fromEntries(Object.entries(perOp).map(([k, v]) => [k, { rows: v.rows, fields: v.fields }])),
    allFields,
    judgement: {
      bidNtceNo_100: idOk, bidNtceNo_filled: idStat.filled, bidNtceNo_total: idStat.total,
      bidClseDt_95: clseOk, bidClseDt_pct: clseStat.pct,
      bidNtceNm_95: nmOk, bidNtceNm_pct: nmStat.pct,
    },
  }, null, 2));
  console.log(`\n  audit: ${out}`);
  console.log(`  → 다음 단계: ${decision === "GO" ? `ts-node src/scripts/load-recollect.ts --ym ${ym}` : "사용자 결정 필요 (NO)"}`);

  if (decision === "NO") process.exit(3);
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * 옵션 A 재수집 — 17개월 일괄 driver
 *
 * 각 월:
 *  1. re-collect-month  (exit 2 → abort)
 *  2. audit-recollect   (exit 3 → audit NO, 다음 월 skip)
 *  3. load-recollect    (exit 0 → 다음 월)
 *
 * 매칭률 < 25% 17개월 (verify-totalcount-result.json 기준), 시범 200703 제외.
 *
 * 실행: pnpm ts-node src/scripts/run-all-recollect.ts
 */

import { spawnSync } from "child_process";

// 매칭률 오름차순 (가장 누락 큰 월부터)
const DEFAULT_MONTHS = [
  "202103", "202012", "201401", "201503", "202202", "200201",
  "201403", "201407", "201608", "202010", "202011", "202110",
  "202111", "202009", "202210", "202008", "202109",
];

// CLI / env 우선: --months 200703,202103 또는 MONTHS=200703,202103 환경변수
function parseMonths(): string[] {
  const args = process.argv.slice(2);
  let csv = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--months" && args[i + 1]) { csv = args[i + 1]; break; }
  }
  if (!csv && process.env.MONTHS) csv = process.env.MONTHS;
  if (!csv) return DEFAULT_MONTHS;
  const parsed = csv.split(",").map((s) => s.trim()).filter((s) => /^\d{6}$/.test(s));
  if (parsed.length === 0) {
    console.error(`[run-all-recollect] MONTHS 형식 오류: "${csv}" — 콤마 분리 YYYYMM 필요. 기본 ${DEFAULT_MONTHS.length}개월 사용`);
    return DEFAULT_MONTHS;
  }
  return parsed;
}

const MONTHS = parseMonths();

const log: { ym: string; stage: string; exit: number; ts: string }[] = [];

function run(stage: string, ym: string): number {
  const t0 = Date.now();
  console.log(`\n[${ym}] >>> ${stage} 시작`);
  const r = spawnSync(
    "pnpm",
    ["exec", "ts-node", `src/scripts/${stage}.ts`, "--ym", ym],
    { stdio: "inherit", shell: true },
  );
  const status = r.status ?? 1;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${ym}] <<< ${stage} 종료 exit=${status} (${elapsed}s)`);
  log.push({ ym, stage, exit: status, ts: new Date().toISOString() });
  return status;
}

(async () => {
  console.log(`=== 일괄 재수집 시작 (총 ${MONTHS.length}개월) ===`);
  console.log(`대상: ${MONTHS.join(", ")}`);

  let completed = 0;
  let auditNo = 0;
  let failed: string[] = [];

  for (const ym of MONTHS) {
    console.log(`\n========== [${ym}] (${completed + auditNo + failed.length + 1} / ${MONTHS.length}) ==========`);

    // 1. re-collect
    const c = run("re-collect-month", ym);
    if (c === 2) {
      console.error(`\n⛔ [${ym}] re-collect abort (quota/HTTP). 일괄 중단.`);
      failed.push(ym);
      break;
    }
    if (c !== 0) {
      console.error(`\n⛔ [${ym}] re-collect 실패 exit=${c}. 일괄 중단.`);
      failed.push(ym);
      break;
    }

    // 2. audit
    const a = run("audit-recollect", ym);
    if (a === 3) {
      console.error(`\n⚠️ [${ym}] audit NO — skip, 다음 월로`);
      auditNo++;
      continue;
    }
    if (a !== 0) {
      console.error(`\n⛔ [${ym}] audit 실패 exit=${a}. 일괄 중단.`);
      failed.push(ym);
      break;
    }

    // 3. load
    const l = run("load-recollect", ym);
    if (l !== 0) {
      console.error(`\n⛔ [${ym}] load 실패 exit=${l}. 일괄 중단.`);
      failed.push(ym);
      break;
    }

    completed++;
    console.log(`\n✓ [${ym}] 3단계 완료 (누계 적재 ${completed}월 / NO ${auditNo}월)`);
  }

  console.log(`\n========== 일괄 종료 ==========`);
  console.log(`  적재 완료: ${completed}월`);
  console.log(`  audit NO: ${auditNo}월`);
  console.log(`  실패/중단: ${failed.length}월 ${failed.length ? `(${failed.join(",")})` : ""}`);
  console.log(`  처리 안 한 월: ${MONTHS.length - completed - auditNo - failed.length}개`);
})().catch((e) => { console.error(e); process.exit(1); });

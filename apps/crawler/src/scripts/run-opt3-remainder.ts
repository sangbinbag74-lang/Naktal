/**
 * 옵션 3 — 잔여 109개월 전수 재수집 (3단계 검증 파이프라인)
 *
 * 사용자 명시 (2026-05-04 자정 직전): "3번 시작 / 동일하게 10분단위 보고"
 * 사용자 명시 (옵션 A 선택): "당연히 A지" — extras·BidResult도 동일 3단계 + audit
 * 본 스크립트는 옵션 1 (18개월 in-flight) 완전 종료 후 자동 시작.
 *
 * 의존:
 *   - .recollect-cache/final-chain-done.flag (bg8zcf3wk = run-final-chain.ts 종료 신호)
 *   - run-all-recollect.ts (Stage 1: Announcement 본체 3단계)
 *   - re-collect-extras-month / audit-extras / load-extras (Stage 2 per-month)
 *   - re-collect-bid-month / audit-bid / load-bid (Stage 3 per-month)
 *   - verify-totalcount.ts (전구간 재검증)
 *
 * 단계:
 *   0. final-chain-done.flag 폴링 대기
 *   1. driver: 109월 모집(JSONL) → 분석(audit) → 적재(UPSERT) — Announcement 본체
 *   2. extras 109월 (월별 3단계 검증):
 *        re-collect-extras-month --ym → audit-extras --ym → load-extras --ym
 *   3. bid 109월 (월별 3단계 검증):
 *        re-collect-bid-month --ym → audit-bid --ym → load-bid --ym
 *   4. verify-totalcount 재실행 (전구간)
 *   5. opt3-done.flag 기록
 *
 * 종료 코드 처리 (월 단위):
 *   - 0: 정상
 *   - 2: quota_low — 일일 한도 도달, wrapper abort (다음 날 재실행 시 자동 재개 — 캐시/idempotent)
 *   - 3: audit NO — 해당 월 적재 skip, 다음 월 진행
 *   - 기타: 월 단위 실패로 기록, 다음 월 진행
 *
 * 실행: pnpm exec ts-node src/scripts/run-opt3-remainder.ts
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const MONTHS_109 = [
  "200202","200203","200204","200205","200206","200207","200208","200209","200210","200211","200212",
  "200301","200302","200303","200305","200310","200311",
  "200401","200402","200403","200409","200410",
  "200501","200502","200503","200506","200508","200509",
  "200601","200602","200603",
  "200701","200702","200704",
  "200801","200802","200803",
  "200901",
  "201001","201007","201009","201010",
  "201101","201102",
  "201201",
  "201301","201303",
  "201402","201404","201408","201411",
  "201501","201502","201504","201508","201509","201511",
  "201601","201602","201603","201606","201607","201609","201610","201611",
  "201701","201702","201711",
  "201801","201810","201811",
  "201901","201910","201911",
  "202001","202002","202006","202007",
  "202101","202102","202104","202105","202106","202107","202108","202112",
  "202201","202203","202204","202205","202206","202207","202208","202209","202211",
  "202301","202310","202311",
  "202401","202404","202405","202409","202410","202411",
  "202501","202502","202510","202511",
  "202601",
];

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
const FINAL_CHAIN_DONE = path.join(CACHE_DIR, "final-chain-done.flag");
const OPT3_DONE = path.join(CACHE_DIR, "opt3-done.flag");

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function run(label: string, cmd: string, args: string[], env: Record<string, string> = {}): number {
  const t0 = Date.now();
  console.log(`\n[${ts()}] [${label}] >>> ${cmd} ${args.slice(0, 8).join(" ")}${args.length > 8 ? " ..." : ""}`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  const status = r.status ?? 1;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${ts()}] [${label}] <<< exit=${status} (${elapsed}s)`);
  return status;
}

async function waitFinalChainDone() {
  console.log(`[${ts()}] === 0단계: final-chain-done.flag 폴링 대기 ===`);
  console.log(`  대상: ${FINAL_CHAIN_DONE}`);
  let waited = 0;
  while (!fs.existsSync(FINAL_CHAIN_DONE)) {
    await sleep(60_000);
    waited += 60;
    if (waited % 1800 === 0) {
      console.log(`[${ts()}] 대기 중... ${(waited / 60).toFixed(0)}분 경과`);
    }
  }
  try {
    const flag = JSON.parse(fs.readFileSync(FINAL_CHAIN_DONE, "utf-8"));
    console.log(`[${ts()}] final-chain-done.flag 감지 startedAt=${flag.startedAt} endedAt=${flag.endedAt}`);
  } catch {
    console.log(`[${ts()}] final-chain-done.flag 감지 (JSON 파싱 실패 — 무시하고 진행)`);
  }
}

interface MonthlyStat {
  ok: number;
  auditNo: string[];
  failed: string[];
  quotaAbort: string | null;
}

/**
 * 월별 3단계 체인 실행 (모집 → 분석 → 적재)
 *  - 모집 exit 2 (quota_low): 즉시 abort (wrapper level)
 *  - 분석 exit 3 (audit NO): 해당 월 skip, 다음 월 진행
 *  - 분석 결과 EMPTY 또는 GO 시에만 적재
 *  - 모집 exit ≠0/≠2 또는 적재 실패: 월 단위 실패로 기록, 다음 월 진행
 */
function runMonthly3stage(
  phaseLabel: string,
  collectScript: string,
  auditScript: string,
  loadScript: string,
  months: string[],
): MonthlyStat {
  const stat: MonthlyStat = { ok: 0, auditNo: [], failed: [], quotaAbort: null };

  for (let i = 0; i < months.length; i++) {
    const ym = months[i];
    console.log(`\n[${ts()}] === [${phaseLabel}] ${ym} (${i + 1}/${months.length}) ===`);

    // Stage 1 — 모집
    const collectCode = run(
      `${phaseLabel}-collect-${ym}`,
      "pnpm",
      ["exec", "ts-node", `src/scripts/${collectScript}`, "--ym", ym],
    );
    if (collectCode === 2) {
      console.error(`[${ts()}] [${phaseLabel}] ${ym}: 일일 한도 도달 — wrapper abort. 다음 날 재실행으로 재개.`);
      stat.quotaAbort = ym;
      return stat;
    }
    if (collectCode !== 0) {
      console.error(`[${ts()}] [${phaseLabel}] ${ym}: 모집 실패 exit=${collectCode} — skip`);
      stat.failed.push(`${ym}(collect=${collectCode})`);
      continue;
    }

    // Stage 2 — 분석 (audit)
    const auditCode = run(
      `${phaseLabel}-audit-${ym}`,
      "pnpm",
      ["exec", "ts-node", `src/scripts/${auditScript}`, "--ym", ym],
    );
    if (auditCode === 3) {
      console.error(`[${ts()}] [${phaseLabel}] ${ym}: audit NO — 적재 거부, 다음 월 진행`);
      stat.auditNo.push(ym);
      continue;
    }
    if (auditCode !== 0) {
      console.error(`[${ts()}] [${phaseLabel}] ${ym}: audit 실패 exit=${auditCode} — skip`);
      stat.failed.push(`${ym}(audit=${auditCode})`);
      continue;
    }

    // Stage 3 — 적재 (audit GO/EMPTY)
    const loadCode = run(
      `${phaseLabel}-load-${ym}`,
      "pnpm",
      ["exec", "ts-node", `src/scripts/${loadScript}`, "--ym", ym],
    );
    if (loadCode !== 0) {
      console.error(`[${ts()}] [${phaseLabel}] ${ym}: 적재 실패 exit=${loadCode}`);
      stat.failed.push(`${ym}(load=${loadCode})`);
      continue;
    }

    stat.ok++;
  }

  return stat;
}

(async () => {
  console.log(`\n[${ts()}] ============================================`);
  console.log(`[${ts()}] === 옵션 3 잔여 109개월 전수 재수집 시작 ===`);
  console.log(`[${ts()}] === (옵션 A: 모든 단계 3단계 검증 적용) ===`);
  console.log(`[${ts()}] ============================================`);
  console.log(`  대상: ${MONTHS_109.length}개월 (verify-totalcount 미완료 127월 - 옵션1 18월 = 109월)`);

  const startTs = Date.now();
  const summary: Record<string, any> = { startedAt: ts(), monthsCount: MONTHS_109.length };

  // 0
  try {
    await waitFinalChainDone();
    summary.step0 = "final-chain-done 감지";
  } catch (e) {
    console.error("final-chain-done 대기 실패:", e);
    summary.step0 = "오류";
  }

  const monthsCsv = MONTHS_109.join(",");

  // 1. driver — Announcement 본체 모집/분석/적재 109월 (run-all-recollect = 이미 3단계 검증 포함)
  console.log(`\n[${ts()}] === 1단계: driver (run-all-recollect) 109월 — Announcement 본체 ===`);
  const driverCode = run(
    "opt3-driver",
    "pnpm",
    ["exec", "ts-node", "src/scripts/run-all-recollect.ts"],
    { MONTHS: monthsCsv },
  );
  summary.step1_driver = driverCode === 0 ? "완료" : `exit=${driverCode}`;

  // 2. extras — 보조 13 op 월별 3단계 검증
  console.log(`\n[${ts()}] === 2단계: extras 109월 (월별 3단계 검증) ===`);
  const extrasStat = runMonthly3stage(
    "opt3-extras",
    "re-collect-extras-month.ts",
    "audit-extras.ts",
    "load-extras.ts",
    MONTHS_109,
  );
  summary.step2_extras = {
    ok: extrasStat.ok,
    total: MONTHS_109.length,
    auditNo: extrasStat.auditNo,
    failed: extrasStat.failed,
    quotaAbort: extrasStat.quotaAbort,
  };
  if (extrasStat.quotaAbort) {
    console.log(`[${ts()}] extras 단계에서 일일 한도 도달 — bid 단계 skip (다음 날 재실행)`);
    summary.step3_bid = { skipped: "extras 단계에서 quota_low" };
    summary.step4_verify = { skipped: "extras 단계 abort" };
  } else {
    // 3. bid — BidResult 4 op 월별 3단계 검증
    console.log(`\n[${ts()}] === 3단계: bid 109월 (월별 3단계 검증) ===`);
    const bidStat = runMonthly3stage(
      "opt3-bid",
      "re-collect-bid-month.ts",
      "audit-bid.ts",
      "load-bid.ts",
      MONTHS_109,
    );
    summary.step3_bid = {
      ok: bidStat.ok,
      total: MONTHS_109.length,
      auditNo: bidStat.auditNo,
      failed: bidStat.failed,
      quotaAbort: bidStat.quotaAbort,
    };

    if (bidStat.quotaAbort) {
      console.log(`[${ts()}] bid 단계에서 일일 한도 도달 — verify skip (다음 날 재실행)`);
      summary.step4_verify = { skipped: "bid 단계 abort" };
    } else {
      // 4. verify-totalcount 재실행
      console.log(`\n[${ts()}] === 4단계: verify-totalcount 재실행 (전구간) ===`);
      const verifyCode = run(
        "opt3-verify",
        "pnpm",
        ["exec", "ts-node", "src/scripts/verify-totalcount.ts"],
      );
      summary.step4_verify = verifyCode === 0 ? "완료" : `exit=${verifyCode}`;
    }
  }

  summary.endedAt = ts();
  summary.elapsedMin = ((Date.now() - startTs) / 60_000).toFixed(1);

  console.log(`\n[${ts()}] ============================================`);
  console.log(`[${ts()}] === 옵션 3 종료 — 요약 ===`);
  console.log(`[${ts()}] ============================================`);
  console.log(JSON.stringify(summary, null, 2));

  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(OPT3_DONE, JSON.stringify(summary, null, 2));
    console.log(`  sentinel: opt3-done.flag 기록`);
  } catch (e) { console.error("sentinel 기록 실패:", e); }
})().catch((e) => { console.error(e); process.exit(1); });

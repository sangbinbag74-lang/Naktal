/**
 * 옵션 A 재수집 — 미완료 127개월 전수 (옵션 1 18 + 옵션 3 109 통합)
 *
 * 사용자 명시 (2026-05-05): "처음부터 모든 월을 다시 수집하자" → "미완료 127월" 정정 동의
 * 근거: verify-totalcount-result.json 매칭률 <80% 월 127개 (plan H-3 표)
 *
 * 단계:
 *   1. driver: 127월 Announcement 본체 모집/분석/적재 (run-all-recollect, MONTHS env)
 *   2. extras 127월 (월별 3단계):
 *        re-collect-extras-month --ym → audit-extras --ym → load-extras --ym
 *   3. bid 127월 (월별 3단계):
 *        re-collect-bid-month --ym → audit-bid --ym → load-bid --ym
 *   4. verify-totalcount 재실행 (전구간)
 *   5. 127months-done.flag 기록
 *
 * 종료 코드 (월 단위):
 *   - 0: 정상
 *   - 2: quota_low — wrapper abort (다음 날 재실행 시 idempotent 재개)
 *   - 3: audit NO — 해당 월 적재 skip, 다음 월 진행
 *   - 기타: 월 단위 실패 기록, 다음 월 진행
 *
 * 실행: pnpm exec ts-node src/scripts/run-127months.ts
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// 옵션 1 (매칭률 ≤25%) 18월
const MONTHS_18 = [
  "200201","200703","201401","201403","201407","201503","201608","202008","202009",
  "202010","202011","202012","202103","202109","202110","202111","202202","202210",
];

// 옵션 3 (매칭률 25~80%) 109월
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

const MONTHS_127 = Array.from(new Set([...MONTHS_18, ...MONTHS_109])).sort();

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
const DONE_FLAG = path.join(CACHE_DIR, "127months-done.flag");

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

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

interface MonthlyStat {
  ok: number;
  auditNo: string[];
  failed: string[];
  quotaAbort: string | null;
}

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

    // 모집
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

    // 분석
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

    // 적재
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
  console.log(`[${ts()}] === 127개월 전수 재수집 시작 (옵션 A 3단계 검증) ===`);
  console.log(`[${ts()}] ============================================`);
  console.log(`  대상: ${MONTHS_127.length}개월 (18 + 109, dedupe + 시간순)`);
  console.log(`  최초: ${MONTHS_127[0]}, 최종: ${MONTHS_127[MONTHS_127.length - 1]}`);

  const startTs = Date.now();
  const summary: Record<string, any> = {
    startedAt: ts(),
    monthsCount: MONTHS_127.length,
    months: MONTHS_127,
  };

  const monthsCsv = MONTHS_127.join(",");

  // 1. driver — Announcement 본체 (run-all-recollect = 이미 3단계)
  if (process.env.SKIP_STAGE_1 === "1") {
    console.log(`\n[${ts()}] === 1단계: SKIP (SKIP_STAGE_1=1, 사용자 지시) ===`);
    summary.step1_driver = "skip (SKIP_STAGE_1=1)";
  } else {
    console.log(`\n[${ts()}] === 1단계: driver (run-all-recollect) ${MONTHS_127.length}월 — Announcement 본체 ===`);
    const driverCode = run(
      "127m-driver",
      "pnpm",
      ["exec", "ts-node", "src/scripts/run-all-recollect.ts"],
      { MONTHS: monthsCsv },
    );
    summary.step1_driver = driverCode === 0 ? "완료" : `exit=${driverCode}`;
  }

  // 2. extras 월별 3단계
  console.log(`\n[${ts()}] === 2단계: extras ${MONTHS_127.length}월 (월별 3단계 검증) ===`);
  const extrasStat = runMonthly3stage(
    "127m-extras",
    "re-collect-extras-month.ts",
    "audit-extras.ts",
    "load-extras.ts",
    MONTHS_127,
  );
  summary.step2_extras = {
    ok: extrasStat.ok,
    total: MONTHS_127.length,
    auditNo: extrasStat.auditNo,
    failed: extrasStat.failed,
    quotaAbort: extrasStat.quotaAbort,
  };

  if (extrasStat.quotaAbort) {
    console.log(`[${ts()}] extras 단계에서 일일 한도 도달 — bid 단계 skip (다음 날 재실행으로 재개)`);
    summary.step3_bid = { skipped: "extras 단계 quota_low" };
    summary.step4_verify = { skipped: "extras 단계 abort" };
  } else {
    // 3. bid 월별 3단계
    console.log(`\n[${ts()}] === 3단계: bid ${MONTHS_127.length}월 (월별 3단계 검증) ===`);
    const bidStat = runMonthly3stage(
      "127m-bid",
      "re-collect-bid-month.ts",
      "audit-bid.ts",
      "load-bid.ts",
      MONTHS_127,
    );
    summary.step3_bid = {
      ok: bidStat.ok,
      total: MONTHS_127.length,
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
        "127m-verify",
        "pnpm",
        ["exec", "ts-node", "src/scripts/verify-totalcount.ts"],
      );
      summary.step4_verify = verifyCode === 0 ? "완료" : `exit=${verifyCode}`;
    }
  }

  summary.endedAt = ts();
  summary.elapsedMin = ((Date.now() - startTs) / 60_000).toFixed(1);

  console.log(`\n[${ts()}] ============================================`);
  console.log(`[${ts()}] === 127개월 재수집 종료 — 요약 ===`);
  console.log(`[${ts()}] ============================================`);
  console.log(JSON.stringify(summary, null, 2));

  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(DONE_FLAG, JSON.stringify(summary, null, 2));
    console.log(`  sentinel: 127months-done.flag 기록`);
  } catch (e) { console.error("sentinel 기록 실패:", e); }
})().catch((e) => { console.error(e); process.exit(1); });

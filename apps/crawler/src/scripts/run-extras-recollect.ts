/**
 * 옵션 A 재수집 — 후속: 17개월 보조 API 5종 + reparse
 *
 * driver(run-all-recollect.ts) 종료 후 호출.
 * - 각 월: bulk-import-extras-v2 --from {ym} --to {ym}
 *   (LicenseLimit, Cnstwk/Servc/Thng BsisAmount, CalclA, ChgHst 3종, Frgcpt 9개 API)
 * - 마지막: reparse-announcement-extras (rawJson → 9개 컬럼)
 *
 * 실행: pnpm exec ts-node src/scripts/run-extras-recollect.ts
 */
import { spawnSync } from "child_process";

const DEFAULT_MONTHS = [
  "200703", // 시범 + 본 17개월 = 총 18개월 보조 API 채움
  "202103", "202012", "201401", "201503", "202202", "200201",
  "201403", "201407", "201608", "202010", "202011", "202110",
  "202111", "202009", "202210", "202008", "202109",
];

// CLI / env: MONTHS=200201,200202 또는 --months 콤마분리 YYYYMM (run-all-recollect와 동일 규약)
function parseMonths(): string[] {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--months");
  let csv = i >= 0 ? argv[i + 1] : "";
  if (!csv && process.env.MONTHS) csv = process.env.MONTHS;
  if (!csv) return DEFAULT_MONTHS;
  const parsed = csv.split(",").map((s) => s.trim()).filter((s) => /^\d{6}$/.test(s));
  if (parsed.length === 0) {
    console.error(`[run-extras-recollect] MONTHS 형식 오류: "${csv}" — 콤마 분리 YYYYMM 필요. 기본 ${DEFAULT_MONTHS.length}개월 사용`);
    return DEFAULT_MONTHS;
  }
  return parsed;
}

const MONTHS = parseMonths();

function run(label: string, cmd: string, args: string[]): number {
  const t0 = Date.now();
  console.log(`\n[${label}] >>> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  const status = r.status ?? 1;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${label}] <<< exit=${status} (${elapsed}s)`);
  return status;
}

(async () => {
  console.log(`=== 보조 API 후속 수집 시작 (총 ${MONTHS.length}개월) ===`);
  console.log(`대상: ${MONTHS.join(", ")}`);

  const failed: string[] = [];
  for (let i = 0; i < MONTHS.length; i++) {
    const ym = MONTHS[i];
    console.log(`\n========== [${ym}] (${i + 1} / ${MONTHS.length}) ==========`);
    const code = run(
      `extras-${ym}`,
      "pnpm",
      ["exec", "ts-node", "src/bulk-import-extras-v2.ts", "--from", ym, "--to", ym],
    );
    if (code !== 0) {
      console.error(`⚠️ [${ym}] bulk-import-extras-v2 실패 exit=${code} — 다음 월 계속`);
      failed.push(ym);
    }
  }

  console.log(`\n========== reparse-announcement-extras (전체 rawJson → 9컬럼) ==========`);
  const reparseCode = run(
    "reparse-extras",
    "pnpm",
    ["exec", "ts-node", "src/scripts/reparse-announcement-extras.ts"],
  );
  if (reparseCode !== 0) {
    console.error(`⚠️ reparse 실패 exit=${reparseCode}`);
    failed.push("reparse");
  }

  console.log(`\n========== 후속 수집 종료 ==========`);
  console.log(`  처리 시도: ${MONTHS.length}개월 + reparse`);
  console.log(`  실패: ${failed.length}건 ${failed.length ? `(${failed.join(",")})` : ""}`);

  // sentinel: run-final-chain.ts polling 용
  try {
    const fs = require("fs");
    const path = require("path");
    const cacheDir = path.resolve(__dirname, "../../.recollect-cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, "extras-done.flag"),
      JSON.stringify({ ts: new Date().toISOString(), failed }, null, 2),
    );
    console.log("  sentinel: extras-done.flag 기록");
  } catch (e) { console.error("sentinel 기록 실패:", e); }
})().catch((e) => { console.error(e); process.exit(1); });

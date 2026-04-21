/**
 * 150페이지 초과로 잘린 월 자동 재실행
 *
 * audit-missing-data 결과로 식별된 66개월 재실행.
 * pageNo 한도 1000으로 상향 완료 후 이 스크립트 실행.
 *
 * 실행: pnpm ts-node src/scripts/rerun-missing-months.ts
 */
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const TASK_DIR = "C:\\Users\\psp00\\AppData\\Local\\Temp\\claude\\c--01-Ai-23-Naktal\\7aa507d8-bc34-4c57-ad9f-107da32bfab0\\tasks";

function scanLogsForMissingMonths(): Map<string, Set<string>> {
  // script → months set
  const result = new Map<string, Set<string>>();

  const logs = [
    { id: "b9aijxwwn", script: "bulk-import-extras-v2.ts" }, // v2 (2015~2026)
    { id: "bdg1ezs2b", script: "bulk-missing-apis.ts" },     // missing (2002~2014)
    { id: "bg29scl6b", script: "bulk-opening.ts" },           // opening
    { id: "bdswgmnxy", script: "bulk-import-extras.ts" },    // v1 old
  ];

  for (const l of logs) {
    const logPath = path.join(TASK_DIR, `${l.id}.output`);
    if (!fs.existsSync(logPath)) continue;
    const text = fs.readFileSync(logPath, "utf-8");
    const lines = text.split("\n");

    let currentMonth = "";
    const months = result.get(l.script) ?? new Set<string>();

    for (const line of lines) {
      const monthMatch = line.match(/^\[(\d+)\/(\d+)\]\s+(\d{4})-(\d{2})/);
      if (monthMatch) {
        currentMonth = `${monthMatch[3]}-${monthMatch[4]}`;
        continue;
      }
      // page_limit 또는 timeout 발견 시 해당 월 표시
      if (/150페이지 초과|1000페이지 초과|timeout/i.test(line)) {
        if (currentMonth) months.add(currentMonth);
      }
      // ✗ month 에러
      const errMatch = line.match(/✗\s+(\d{4})-(\d+):/);
      if (errMatch) {
        const m = `${errMatch[1]}-${errMatch[2].padStart(2, "0")}`;
        months.add(m);
      }
    }
    if (months.size > 0) result.set(l.script, months);
  }
  return result;
}

function runCmd(cmd: string): boolean {
  console.log(`\n▶ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: path.resolve(__dirname, "../..") });
    return true;
  } catch (e) {
    console.error(`  ✗ 실패: ${(e as Error).message.slice(0, 100)}`);
    return false;
  }
}

function main() {
  console.log(`=== 누락 월 재실행 (pageNo 1000 상향 버전) ===\n`);
  const missing = scanLogsForMissingMonths();

  if (missing.size === 0) {
    console.log(`재실행 대상 없음. 누락 0건.`);
    return;
  }

  let total = 0;
  for (const [script, months] of missing) {
    console.log(`\n[${script}] ${months.size}개월 재실행`);
    total += months.size;
  }
  console.log(`\n총 ${total}회 재실행 시작\n`);

  const tStart = Date.now();
  let done = 0;
  let failed = 0;

  for (const [script, months] of missing) {
    const sorted = [...months].sort();
    for (const m of sorted) {
      const ym = m.replace("-", "");
      const cmd = `pnpm ts-node src/${script} --from=${ym} --to=${ym}`;
      const ok = runCmd(cmd);
      if (ok) done++; else failed++;
      const elapsed = ((Date.now() - tStart) / 1000 / 60).toFixed(1);
      console.log(`\n진행: ${done + failed}/${total} (성공 ${done}, 실패 ${failed}) — 경과 ${elapsed}분`);
    }
  }

  console.log(`\n=== 재실행 완료: 성공 ${done} / 실패 ${failed}, ${((Date.now() - tStart) / 1000 / 60).toFixed(1)}분 ===`);
}

main();

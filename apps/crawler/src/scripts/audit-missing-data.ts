/**
 * 데이터 수집 누락 감사 스크립트
 *
 * 1) 스크립트 로그에서 에러/중단/timeout 패턴 추출
 * 2) 재실행 필요한 (스크립트, 월, API) 목록 생성
 *
 * 실행: pnpm ts-node src/scripts/audit-missing-data.ts
 */
import * as fs from "fs";
import * as path from "path";

interface AuditIssue {
  script: string;
  type: "timeout" | "page_limit" | "http_error" | "api_error" | "unknown";
  month?: string;
  api?: string;
  details: string;
}

function scanLog(logPath: string, scriptName: string): AuditIssue[] {
  if (!fs.existsSync(logPath)) return [];
  const text = fs.readFileSync(logPath, "utf-8");
  const lines = text.split("\n");
  const issues: AuditIssue[] = [];

  let currentMonth = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 월 경계 감지
    const monthMatch = line.match(/^\[(\d+)\/(\d+)\]\s+(\d{4}-\d{2})/);
    if (monthMatch) {
      currentMonth = monthMatch[3];
      continue;
    }

    // timeout
    if (/timeout/i.test(line)) {
      issues.push({
        script: scriptName, type: "timeout", month: currentMonth,
        details: line.trim().slice(0, 200),
      });
    }
    // 페이지 초과 중단
    else if (/150페이지 초과 중단|100페이지 초과/.test(line)) {
      const apiMatch = line.match(/\[([^\]]+)\]/);
      issues.push({
        script: scriptName, type: "page_limit",
        month: currentMonth, api: apiMatch?.[1],
        details: line.trim().slice(0, 200),
      });
    }
    // ✗ 에러
    else if (/✗\s+(\d{4})-(\d+):/.test(line)) {
      const m = line.match(/✗\s+(\d{4})-(\d+):\s*(.+)/);
      if (m) {
        const month = `${m[1]}-${m[2].padStart(2, "0")}`;
        const msg = m[3];
        let type: AuditIssue["type"] = "unknown";
        if (/HTTP (4|5)\d\d/.test(msg)) type = "http_error";
        else if (/timeout/i.test(msg)) type = "timeout";
        else if (/ON CONFLICT|does not exist|syntax error/.test(msg)) type = "api_error";
        issues.push({
          script: scriptName, type, month,
          details: msg.slice(0, 200),
        });
      }
    }
    // [API] 에러 패턴
    else if (/\[.*?\]\s+실패/.test(line)) {
      issues.push({
        script: scriptName, type: "api_error",
        month: currentMonth,
        details: line.trim().slice(0, 200),
      });
    }
  }
  return issues;
}

function main() {
  const taskDir = "C:\\Users\\psp00\\AppData\\Local\\Temp\\claude\\c--01-Ai-23-Naktal\\7aa507d8-bc34-4c57-ad9f-107da32bfab0\\tasks";

  // 알려진 모든 task output 파일
  const logs = [
    { id: "b9aijxwwn", name: "v2 (2015~2026)" },
    { id: "bg29scl6b", name: "opening (2002~2026)" },
    { id: "bdg1ezs2b", name: "missing (2002~2014)" },
    { id: "basksixmq", name: "A값 backfill (2002~2014)" },
    { id: "bopjg2yed", name: "v2 old (중단됨)" },
    { id: "bdswgmnxy", name: "bulk-extras v1 (2002~2014 완료분)" },
  ];

  console.log(`=== 데이터 수집 누락 감사 ===\n`);

  const allIssues: AuditIssue[] = [];
  for (const l of logs) {
    const logPath = path.join(taskDir, `${l.id}.output`);
    if (!fs.existsSync(logPath)) {
      console.log(`[${l.name}] 로그 없음 (${l.id})`);
      continue;
    }
    const issues = scanLog(logPath, l.name);
    allIssues.push(...issues);
    console.log(`[${l.name}] ${issues.length}건 이슈`);
  }

  console.log(`\n=== 총 ${allIssues.length}건 이슈 ===\n`);

  // 타입별 집계
  const byType = new Map<string, number>();
  for (const i of allIssues) byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
  console.log(`[유형별]`);
  for (const [t, n] of byType) console.log(`  ${t}: ${n}`);

  // 월별 이슈
  const byMonth = new Map<string, AuditIssue[]>();
  for (const i of allIssues) {
    if (!i.month) continue;
    const arr = byMonth.get(i.month) ?? [];
    arr.push(i);
    byMonth.set(i.month, arr);
  }

  if (byMonth.size > 0) {
    console.log(`\n[월별 이슈 (재실행 권장)]`);
    const sorted = [...byMonth.entries()].sort();
    for (const [month, issues] of sorted) {
      console.log(`  ${month}: ${issues.length}건`);
      for (const i of issues.slice(0, 3)) {
        console.log(`    - [${i.script}] ${i.type}: ${i.details.slice(0, 120)}`);
      }
    }
  }

  // 재실행 권장 스크립트
  const rerun = new Set<string>();
  for (const i of allIssues) {
    if (i.month && (i.type === "timeout" || i.type === "page_limit" || i.type === "http_error")) {
      rerun.add(`${i.script} --from=${i.month.replace("-", "")} --to=${i.month.replace("-", "")}`);
    }
  }
  if (rerun.size > 0) {
    console.log(`\n[재실행 권장]`);
    for (const r of rerun) console.log(`  ${r}`);
  }
}
main();

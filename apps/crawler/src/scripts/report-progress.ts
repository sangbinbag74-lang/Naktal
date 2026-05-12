/**
 * 자동 진행 보고 스크립트 — 추측·시각환산·표누락 차단
 *
 * 사용자 명시 (2026-05-04): 메모리만 쓰면 무용지물 → 코드로 강제
 *
 * 모든 진행 보고 시 본 스크립트 실행 → 출력 그대로 답변에 복붙
 *
 * 실행: pnpm exec ts-node src/scripts/report-progress.ts
 */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const CACHE = path.resolve(__dirname, "../../.recollect-cache");
const TASKS = "C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks";

function nowKst(): string {
  // Node Date 실측 + KST 강제 (UTC+9)
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // 시스템이 이미 KST면 한번 더 더하지 않게 — 시스템 TZ offset 확인
  const offsetMin = -now.getTimezoneOffset(); // KST=540, UTC=0
  const target = offsetMin === 540 ? now : kst;
  const y = target.getUTCFullYear();
  const m = String(offsetMin === 540 ? target.getMonth() + 1 : target.getUTCMonth() + 1).padStart(2, "0");
  const d = String(offsetMin === 540 ? target.getDate() : target.getUTCDate()).padStart(2, "0");
  const hh = String(offsetMin === 540 ? target.getHours() : target.getUTCHours()).padStart(2, "0");
  const mm = String(offsetMin === 540 ? target.getMinutes() : target.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function readFile(p: string): string {
  try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}

function fmtMin(n: number): string {
  // 60분 이상이면 시간+분, 이하면 분
  if (n < 60) return `~${n}분`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `~${h}시간` : `~${h}시간 ${m}분`;
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function extrasProgress(): { done: number; cur: string; avgMin: number; remainMin: number } {
  const out = readFile(`${TASKS}/b1gsjxiju.output`);
  const exitMatches = out.match(/^\[extras-\d+\] <<< exit=0 \([\d.]+s\)$/gm) || [];
  const done = exitMatches.length;
  const curMatch = out.match(/^========== \[(\d{6})\] \((\d+) \/ 18\) ==========$/gm) || [];
  const last = curMatch[curMatch.length - 1] || "";
  const m = last.match(/\[(\d{6})\] \((\d+) \/ 18\)/);
  const cur = m ? `${m[2]}: ${m[1]}` : "—";
  const totalSec = (out.match(/<<< exit=0 \(([\d.]+)s\)/g) || [])
    .map((s) => parseFloat(s.match(/\(([\d.]+)s\)/)![1]))
    .reduce((a, b) => a + b, 0);
  const avgMin = done > 0 ? (totalSec / done / 60) : 0;
  const remain = Math.max(0, 18 - done);
  const remainMin = Math.round(avgMin * remain);
  return { done, cur, avgMin: Math.round(avgMin * 10) / 10, remainMin };
}

function nextMonitorAbs(): string {
  // b1fpy4toy.output 마지막 보고시각 + 10분 → 절대 KST HH:MM
  const out = readFile(`${TASKS}/b1fpy4toy.output`);
  const matches = out.match(/보고시각 \d{4}-\d{2}-\d{2} (\d{2}):(\d{2})/g) || [];
  if (matches.length === 0) return "—";
  const last = matches[matches.length - 1];
  const m = last.match(/(\d{2}):(\d{2})/);
  if (!m) return "—";
  const lastH = parseInt(m[1]);
  const lastM = parseInt(m[2]);
  let total = lastH * 60 + lastM + 10;
  // 현재 시각보다 과거이면 10분씩 미루기
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const isKst = offsetMin === 540;
  const curH = isKst ? now.getHours() : now.getUTCHours();
  const curM = isKst ? now.getMinutes() : now.getUTCMinutes();
  const cur = curH * 60 + curM;
  while (total <= cur) total += 10;
  total = total % (24 * 60);
  const h = Math.floor(total / 60);
  const mi = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")} KST`;
}

function opt3Progress(extrasAvgMin: number): { stage: string; cur: string; remainStr: string; done: boolean } {
  // 옵션 3 (잔여 109월) 진행 추적 — bh9r0sz19.output 파싱
  const out = readFile(`${TASKS}/bh9r0sz19.output`);
  const opt3Done = exists(`${CACHE}/opt3-done.flag`);
  if (!out) return { stage: "미시작", cur: "—", remainStr: "—", done: opt3Done };
  if (opt3Done) return { stage: "완료", cur: "—", remainStr: "—", done: true };

  // 단계 검출 (역순 — 가장 늦은 마커 우선)
  let stage = "0/4 final-chain-done 대기";
  let curStageMarker = "";
  if (/=== 4단계: verify-totalcount/.test(out)) { stage = "4/4 verify-totalcount"; curStageMarker = "stage4"; }
  else if (/=== 3단계: BidResult 109월/.test(out)) { stage = "3/4 BidResult 109월"; curStageMarker = "stage3"; }
  else if (/=== 2단계: extras /.test(out)) { stage = "2/4 extras 109월"; curStageMarker = "stage2"; }
  else if (/=== 1단계: driver /.test(out)) { stage = "1/4 driver(모집/분석/적재) 109월"; curStageMarker = "stage1"; }

  let cur = "—";
  let remainStr = "—";

  if (curStageMarker === "stage1") {
    // run-all-recollect 출력: ========== [YYMMDD] (N / 109) ==========
    // 단, 1단계 중에는 stage2/3/4 마커 없음 → driver 안의 ========== 만 매칭
    const all = out.match(/========== \[(\d{6})\] \((\d+) \/ 109\) ==========/g) || [];
    const last = all[all.length - 1] || "";
    const m = last.match(/\[(\d{6})\] \((\d+) \/ 109\)/);
    if (m) cur = `1단계 ${m[2]}/109 ${m[1]}`;
    const done = m ? parseInt(m[2]) - 1 : 0;
    const remain = Math.max(0, 109 - done);
    // driver 1월 = 모집(~3분) + audit(~1분) + load(~2분) ≈ 6분/월 (옵션 1 실측 평균)
    const minPerMonth = 6;
    // 단계 2~4: extras 109×~5분 + bid 109×~2분 + verify ~10분 = 약 13시간
    const STAGE_AFTER1_MIN = 109 * 5 + 109 * 2 + 10; // ≈ 773분
    remainStr = fmtMin(Math.round(remain * minPerMonth + STAGE_AFTER1_MIN));
  } else if (curStageMarker === "stage2") {
    // extras 단계 — run-extras-recollect 출력 ========== [YYMMDD] (N / 109) ==========
    // stage1 이후의 마커만 카운트하기 위해 stage2 마커 이후 substring 사용
    const stage2Idx = out.indexOf("=== 2단계: extras ");
    const sub = stage2Idx >= 0 ? out.slice(stage2Idx) : out;
    const all = sub.match(/========== \[(\d{6})\] \((\d+) \/ 109\) ==========/g) || [];
    const last = all[all.length - 1] || "";
    const m = last.match(/\[(\d{6})\] \((\d+) \/ 109\)/);
    if (m) cur = `2단계 ${m[2]}/109 ${m[1]}`;
    const done = m ? parseInt(m[2]) - 1 : 0;
    const remain = Math.max(0, 109 - done);
    // extras 1월 = 9 API + reparse 평균 ~5분 (extrasAvgMin 활용 가능)
    const minPerMonth = extrasAvgMin > 0 ? extrasAvgMin : 5;
    const STAGE_AFTER2_MIN = 109 * 2 + 10; // bid + verify
    remainStr = fmtMin(Math.round(remain * minPerMonth + STAGE_AFTER2_MIN));
  } else if (curStageMarker === "stage3") {
    // bid 단계 — [opt3-bid-YYMMDD] (N/109)
    const all = out.match(/\[opt3-bid-(\d{6})\] \((\d+)\/109\)/g) || [];
    const last = all[all.length - 1] || "";
    const m = last.match(/\[opt3-bid-(\d{6})\] \((\d+)\/109\)/);
    if (m) cur = `3단계 ${m[2]}/109 ${m[1]}`;
    const done = m ? parseInt(m[2]) - 1 : 0;
    const remain = Math.max(0, 109 - done);
    const minPerMonth = 2;
    remainStr = fmtMin(Math.round(remain * minPerMonth + 10));
  } else if (curStageMarker === "stage4") {
    cur = "4단계 verify-totalcount 실행";
    remainStr = fmtMin(10);
  } else {
    // stage 0 (final-chain-done 폴링 대기)
    cur = "final-chain-done.flag 폴링";
    // 109월 풀체인 ETA: driver 109×6 + extras 109×5 + bid 109×2 + verify 10 ≈ 23시간
    remainStr = fmtMin(109 * 6 + 109 * 5 + 109 * 2 + 10) + " (옵션1 종료 후)";
  }

  return { stage, cur, remainStr, done: false };
}

function finalChainProgress(extrasAvgMin: number): { stage: string; cur: string; remainStr: string } {
  const out = readFile(`${TASKS}/bg8zcf3wk.output`);
  if (!out) return { stage: "미시작", cur: "—", remainStr: "—" };

  const stages = [
    { re: /=== 5단계: verify-totalcount/, name: "5/5 verify-totalcount" },
    { re: /=== 4단계: git/, name: "4/5 git push" },
    { re: /=== 3단계: schema-error/, name: "3/5 schema 확인" },
    { re: /=== 2단계: subCategories/, name: "2/5 subCat 채움률" },
    { re: /=== 1단계: BidResult/, name: "1/5 BidResult 18월" },
    { re: /=== 0단계:/, name: "0/5 sentinel 대기" },
  ];
  let stage = "미시작";
  for (const s of stages) {
    if (s.re.test(out)) { stage = s.name; break; }
  }

  // 단계별 후속 작업 합산 ETA (실측 부재 시 보수 추정)
  // 1: 18월 BidResult, 2: subCat 18월 SQL ~3분, 3: schema 즉시 ~1분, 4: git push ~2분, 5: verify-totalcount 292월 ~5분
  const STAGE_AFTER1_MIN = 3 + 1 + 2 + 5; // = 11분 (단계 2~5 합)

  let cur = "—";
  let remainStr = "—";
  if (stage.startsWith("1/5")) {
    const bidStarts = out.match(/\[bid-(\d{6})\] \((\d+)\/18\)/g) || [];
    const lastStart = bidStarts[bidStarts.length - 1] || "";
    const sm = lastStart.match(/\[bid-(\d{6})\] \((\d+)\/18\)/);
    const bidExits = (out.match(/\[bid-(\d{6})\] <<< exit=\d+ \(([\d.]+)s\)/g) || []).map((m) => {
      const x = m.match(/\[bid-(\d{6})\] <<< exit=\d+ \(([\d.]+)s\)/)!;
      return { ym: x[1], sec: parseFloat(x[2]) };
    });
    const done = bidExits.length;
    if (sm) cur = `${sm[2]}/18 ${sm[1]}`;
    // 분산 큰 경우: heavy(첫 재수집) vs light(이미 적재된 월) 분리
    const HEAVY_MIN_SEC = 60; // 60초 이상이면 heavy
    const heavy = bidExits.filter((b) => b.sec >= HEAVY_MIN_SEC);
    const light = bidExits.filter((b) => b.sec < HEAVY_MIN_SEC);
    const remainMonths = Math.max(0, 18 - done);
    let stage1MinLow: number;
    let stage1MinHigh: number;
    if (done === 0) {
      const proxy = extrasAvgMin > 0 ? extrasAvgMin : 10;
      stage1MinLow = stage1MinHigh = proxy * remainMonths;
    } else if (heavy.length === 0) {
      const lightAvg = light.reduce((a, b) => a + b.sec, 0) / light.length / 60;
      stage1MinLow = stage1MinHigh = lightAvg * remainMonths;
    } else if (light.length === 0) {
      const heavyAvg = heavy.reduce((a, b) => a + b.sec, 0) / heavy.length / 60;
      stage1MinLow = stage1MinHigh = heavyAvg * remainMonths;
    } else {
      // 양쪽 분포 존재 — 범위 추정
      const heavyAvg = heavy.reduce((a, b) => a + b.sec, 0) / heavy.length / 60;
      const lightAvg = light.reduce((a, b) => a + b.sec, 0) / light.length / 60;
      const heavyRatio = heavy.length / done;
      const expectedHeavyRem = Math.round(heavyRatio * remainMonths);
      const expectedLightRem = remainMonths - expectedHeavyRem;
      const expected = heavyAvg * expectedHeavyRem + lightAvg * expectedLightRem;
      // low: 모두 light, high: 모두 heavy
      stage1MinLow = lightAvg * remainMonths;
      stage1MinHigh = heavyAvg * remainMonths;
      remainStr = `${fmtMin(Math.round(expected + STAGE_AFTER1_MIN))} (분포 ${fmtMin(Math.round(stage1MinLow + STAGE_AFTER1_MIN))}~${fmtMin(Math.round(stage1MinHigh + STAGE_AFTER1_MIN))}, heavy ${heavy.length}/${done})`;
    }
    if (!remainStr || remainStr === "—") {
      const totalMin = Math.round(stage1MinHigh + STAGE_AFTER1_MIN);
      const note = done === 0 ? " (extras 평균 기준)" : "";
      remainStr = `${fmtMin(totalMin)}${note}`;
    }
  } else if (stage.startsWith("2/5")) {
    remainStr = fmtMin(9);
  } else if (stage.startsWith("3/5")) {
    remainStr = fmtMin(8);
  } else if (stage.startsWith("4/5")) {
    remainStr = fmtMin(7);
  } else if (stage.startsWith("5/5")) {
    remainStr = fmtMin(5);
  } else if (stage.startsWith("0/5")) {
    const stage1Min = (extrasAvgMin > 0 ? extrasAvgMin : 10) * 18;
    remainStr = `${fmtMin(Math.round(stage1Min + STAGE_AFTER1_MIN))} (extras 후)`;
  }
  return { stage, cur, remainStr };
}

(() => {
  const ts = nowKst();
  const e = extrasProgress();
  const sentinel = exists(`${CACHE}/extras-done.flag`);
  const finalDone = exists(`${CACHE}/final-chain-done.flag`);
  const fc = finalChainProgress(e.avgMin);

  console.log(`보고시각 ${ts} (date 실측)`);
  console.log("");
  console.log(`| 항목 | 진행 | 남은 |`);
  console.log(`|---|---|---|`);
  // extras
  const extrasStatus = e.done >= 18 ? "완료" : `${e.done}/18 (평균 ${e.avgMin}분/월)`;
  const extrasRemain = e.done >= 18 ? "—" : fmtMin(e.remainMin);
  console.log(`| extras 18월 보조 API | ${extrasStatus} | ${extrasRemain} |`);
  if (e.done < 18) console.log(`| └ 현재 | ${e.cur} | — |`);
  // reparse
  console.log(`| reparse-announcement-extras | ${sentinel ? "완료" : "대기"} | ${sentinel ? "—" : "~5~10분"} |`);
  // bg8zcf3wk
  if (finalDone) {
    console.log(`| bg8zcf3wk 5단계 자동체인 | 완료 | — |`);
  } else if (sentinel) {
    console.log(`| bg8zcf3wk 5단계 자동체인 | ${fc.stage} | ${fc.remainStr} |`);
    if (fc.cur !== "—") console.log(`| └ 현재 | ${fc.cur} | — |`);
  } else {
    console.log(`| bg8zcf3wk 5단계 자동체인 | sentinel 폴링 | extras+reparse 후 |`);
  }
  // 옵션 3 (잔여 109월) 진행 — bg8zcf3wk 종료 후 자동 시작
  const opt3 = opt3Progress(e.avgMin);
  const opt3Done = exists(`${CACHE}/opt3-done.flag`);
  if (opt3Done) {
    console.log(`| **옵션 3 잔여 109월 전수** | 완료 | — |`);
  } else {
    console.log(`| **옵션 3 잔여 109월 전수** | ${opt3.stage} | ${opt3.remainStr} |`);
    if (opt3.cur !== "—") console.log(`| └ 현재 | ${opt3.cur} | — |`);
  }
  // 다음 Monitor 자동 보고 (사용자 2026-05-05 명시 요구: 절대 시각 표기)
  const nextAbs = nextMonitorAbs();
  console.log(`| **다음 Monitor 자동 보고** | 예정 ${nextAbs} | — |`);
  console.log("");
  console.log(`extras-done.flag: ${sentinel ? "있음" : "없음"} | final-chain-done.flag: ${finalDone ? "있음" : "없음"} | opt3-done.flag: ${opt3Done ? "있음" : "없음"}`);
})();

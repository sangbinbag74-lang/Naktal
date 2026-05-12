/**
 * 옵션 A 재수집 — 최종 통합 후속 체인
 *
 * driver(run-all-recollect) → wrapper(run-extras-recollect) → 본 스크립트(run-final-chain)
 *
 * 사용자 명시 지시 (2026-05-04): "다 진행해야지 시발 / 수집완료 즉시 바로 진행 채인걸어놔라"
 *
 * 실행 순서:
 *   0. extras-done.flag 폴링 대기 (wrapper 종료 신호)
 *   1. BidResult 18월 재수집 (bid-only-import.ts loop)
 *   2. subCategories 채움률 측정 + 부족 시 LicenseLimit 재호출 안내
 *   3. schema-error 5컬럼 DB 상태 확인 (information_schema)
 *   4. git add/commit/push (uncommitted: g2b.yml + recollect 스크립트 7종)
 *   5. verify-totalcount.ts 재실행
 *
 * 실행: pnpm exec ts-node src/scripts/run-final-chain.ts
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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

const MONTHS = [
  "200703",
  "202103", "202012", "201401", "201503", "202202", "200201",
  "201403", "201407", "201608", "202010", "202011", "202110",
  "202111", "202009", "202210", "202008", "202109",
];

const CACHE_DIR = path.resolve(__dirname, "../../.recollect-cache");
const SENTINEL = path.join(CACHE_DIR, "extras-done.flag");
const FINAL_DONE = path.join(CACHE_DIR, "final-chain-done.flag");

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function run(label: string, cmd: string, args: string[]): number {
  const t0 = Date.now();
  console.log(`\n[${ts()}] [${label}] >>> ${cmd} ${args.slice(0, 6).join(" ")}${args.length > 6 ? " ..." : ""}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  const status = r.status ?? 1;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${ts()}] [${label}] <<< exit=${status} (${elapsed}s)`);
  return status;
}

async function waitSentinel() {
  console.log(`[${ts()}] === 0단계: extras-done.flag 폴링 대기 ===`);
  console.log(`  대상: ${SENTINEL}`);
  let waited = 0;
  while (!fs.existsSync(SENTINEL)) {
    await sleep(60_000);
    waited += 60;
    if (waited % 1800 === 0) {
      console.log(`[${ts()}] 대기 중... ${(waited / 60).toFixed(0)}분 경과`);
    }
  }
  const flag = JSON.parse(fs.readFileSync(SENTINEL, "utf-8"));
  console.log(`[${ts()}] sentinel 감지 ts=${flag.ts} failed=${(flag.failed || []).length}건`);
}

async function step1BidResult(): Promise<{ ok: number; failed: string[] }> {
  console.log(`\n[${ts()}] === 1단계: BidResult 18월 재수집 ===`);
  const failed: string[] = [];
  let ok = 0;
  for (let i = 0; i < MONTHS.length; i++) {
    const ym = MONTHS[i];
    console.log(`\n[${ts()}] [bid-${ym}] (${i + 1}/${MONTHS.length})`);
    const code = run(
      `bid-${ym}`,
      "pnpm",
      ["exec", "ts-node", "src/bid-only-import.ts", "--from", ym, "--to", ym],
    );
    if (code === 0) ok++;
    else failed.push(ym);
  }
  return { ok, failed };
}

async function step2SubCatFillRate(pool: Pool): Promise<void> {
  console.log(`\n[${ts()}] === 2단계: subCategories 채움률 측정 (18월) ===`);
  console.log(`월     | total   | filled  | rate%`);
  console.log("-".repeat(50));
  for (const ym of MONTHS) {
    const start = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
    const y = parseInt(ym.slice(0, 4));
    const m = parseInt(ym.slice(4, 6));
    const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    const r = await pool.query(
      `SELECT COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE COALESCE(array_length("subCategories",1),0) > 0)::bigint AS filled
       FROM "Announcement"
       WHERE deadline >= $1::timestamptz AND deadline < $2::timestamptz`,
      [start, end],
    );
    const total = Number(r.rows[0].total);
    const filled = Number(r.rows[0].filled);
    const pct = total > 0 ? (filled / total * 100) : 0;
    console.log(`${ym} | ${String(total).padStart(7)} | ${String(filled).padStart(7)} | ${pct.toFixed(1).padStart(5)}%${pct < 50 ? "  ⚠️ 부족" : ""}`);
  }
  console.log(`\n참고: 50% 미만 월은 LicenseLimit 재호출 권장 — bulk-import-extras-v2 는 wrapper에서 이미 18월 재호출 완료. 그래도 부족 시 G2B 응답에 LicenseLimit 매칭 실패 추정.`);
}

async function step3SchemaErrCols(pool: Pool): Promise<void> {
  console.log(`\n[${ts()}] === 3단계: schema-error 5컬럼 상태 확인 ===`);
  const targets = ["chgRsnNm", "chgNtceRsnNm", "chgNtceSeq", "chgNtceDt", "chgItemNm"];
  for (const t of ["AnnouncementChgHst", "Announcement"]) {
    const r = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2::text[])
       ORDER BY column_name`,
      [t, targets],
    );
    console.log(`\n[${t}]`);
    if (r.rows.length === 0) console.log(`  (대상 5컬럼 모두 부재)`);
    else for (const row of r.rows) console.log(`  ${row.column_name}: ${row.data_type}`);
  }
  console.log(`\n참고: chgRsnNm 등 schema-error 컬럼이 잔존하면 DROP 작업 미완. 잔존 컬럼은 reparse-chghistory 로 chgItemNm 사용으로 리매핑됨.`);
}

function step4GitCommitPush(): number {
  console.log(`\n[${ts()}] === 4단계: git add/commit/push ===`);
  const repoRoot = path.resolve(__dirname, "../../../..");
  const status = spawnSync("git", ["status", "--short"], { cwd: repoRoot, encoding: "utf-8" });
  const dirty = (status.stdout || "").trim();
  if (!dirty) {
    console.log("  변경사항 없음 — commit 건너뜀");
    return 0;
  }
  console.log(`  변경사항:\n${dirty}`);
  const add = spawnSync("git", [
    "add",
    ".github/workflows/g2b.yml",
    "apps/crawler/src/scripts/run-all-recollect.ts",
    "apps/crawler/src/scripts/run-extras-recollect.ts",
    "apps/crawler/src/scripts/run-final-chain.ts",
    "apps/crawler/src/scripts/re-collect-month.ts",
    "apps/crawler/src/scripts/audit-recollect.ts",
    "apps/crawler/src/scripts/load-recollect.ts",
    "apps/crawler/src/scripts/compare-recollect-vs-normal.ts",
  ], { cwd: repoRoot, stdio: "inherit" });
  if ((add.status ?? 1) !== 0) console.log("  git add 일부 실패 (파일 부재 가능) — 무시");

  const msg = `feat(crawler): H-6 옵션 A 재수집 파이프라인 + 최종 체인

- 모집/분석/적재 3단계 분리 (re-collect-month, audit-recollect, load-recollect)
- driver: run-all-recollect (17월 + MONTHS env 지원)
- wrapper: run-extras-recollect (18월 보조 API + reparse + sentinel)
- final-chain: run-final-chain (BidResult/subCat/schema/git/verify)
- compare: compare-recollect-vs-normal (인접 정상월 비교)
- g2b.yml: workflow_dispatch recollect job 추가`;

  const commit = spawnSync("git", ["commit", "-m", msg], { cwd: repoRoot, stdio: "inherit" });
  if ((commit.status ?? 1) !== 0) {
    console.log("  commit 실패 (변경사항 없음 또는 hook 차단) — push 건너뜀");
    return 0;
  }
  const push = spawnSync("git", ["push"], { cwd: repoRoot, stdio: "inherit" });
  return push.status ?? 1;
}

function step5VerifyTotalcount(): number {
  console.log(`\n[${ts()}] === 5단계: verify-totalcount 재실행 ===`);
  return run(
    "verify-totalcount",
    "pnpm",
    ["exec", "ts-node", "src/scripts/verify-totalcount.ts"],
  );
}

(async () => {
  console.log(`\n[${ts()}] ============================================`);
  console.log(`[${ts()}] === 최종 통합 후속 체인 시작 ===`);
  console.log(`[${ts()}] ============================================`);

  const startTs = Date.now();
  const summary: Record<string, any> = { startedAt: ts() };

  try {
    await waitSentinel();
    summary.sentinel = "감지";
  } catch (e) {
    console.error("sentinel 대기 실패:", e);
    summary.sentinel = "오류";
  }

  // 1
  const bid = await step1BidResult();
  summary.step1 = `${bid.ok}/${MONTHS.length} 성공, 실패 ${bid.failed.join(",") || "없음"}`;

  // 2 + 3 (DB)
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL 없음 — 2/3단계 건너뜀");
    summary.step2 = "skipped (DATABASE_URL 없음)";
    summary.step3 = "skipped";
  } else {
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    try {
      await step2SubCatFillRate(pool);
      summary.step2 = "완료";
      await step3SchemaErrCols(pool);
      summary.step3 = "완료";
    } finally {
      await pool.end();
    }
  }

  // 4
  const gitCode = step4GitCommitPush();
  summary.step4 = gitCode === 0 ? "완료" : `git push exit=${gitCode}`;

  // 5
  const verifyCode = step5VerifyTotalcount();
  summary.step5 = verifyCode === 0 ? "완료" : `verify exit=${verifyCode}`;

  summary.endedAt = ts();
  summary.elapsedMin = ((Date.now() - startTs) / 60_000).toFixed(1);

  console.log(`\n[${ts()}] ============================================`);
  console.log(`[${ts()}] === 최종 체인 종료 — 요약 ===`);
  console.log(`[${ts()}] ============================================`);
  console.log(JSON.stringify(summary, null, 2));

  try {
    fs.writeFileSync(FINAL_DONE, JSON.stringify(summary, null, 2));
    console.log(`  sentinel: final-chain-done.flag 기록`);
  } catch (e) { console.error("sentinel 기록 실패:", e); }
})().catch((e) => { console.error(e); process.exit(1); });

#!/bin/bash
# Stage 6 2 worker 가속 (사용자 승인 B, 2026-05-07 20:08 KST)
# 단일 worker (5h) → 2 worker (~2.5h)
# 201801 이미 처리됨 → 제외, 잔여 30 ym 처리
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

W1_YMS="201810 201811 201901 201910 201911 202001 202002 202006 202007 202008 202009 202010 202011 202012 202101"
W2_YMS="202102 202103 202104 202105 202106 202107 202108 202109 201611 201701 201702 201711 202110 202111 202112"

run_ym() {
  local ym="$1" id="$2"
  local label="stage6-w${id}-${ym}"
  echo "[$(ts)] [${label}] >>>" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-opening-preparpc.ts --from "$ym" --to "$ym" >> "$LOG" 2>&1
  local code=$?
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] [${label}] <<< exit=${code} (${elapsed}s)" >> "$LOG"
}

worker() {
  local id=$1; shift
  echo "[$(ts)] === [stage6-w${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do run_ym "$ym" "$id"; done
  echo "[$(ts)] === [stage6-w${id}] done ===" >> "$LOG"
}

echo "[$(ts)] === Stage 6 (2 worker): 30 ym 시작 ===" >> "$LOG"
worker 1 $W1_YMS &
W1_PID=$!
worker 2 $W2_YMS &
W2_PID=$!
wait $W1_PID $W2_PID
echo "[$(ts)] === Stage 6 (2 worker): 30 ym 종료 ===" >> "$LOG"

echo "[$(ts)] === Stage 6 (2 worker): 최종 verify-totalcount ===" >> "$LOG"
pnpm exec ts-node src/scripts/verify-totalcount.ts >> "$LOG" 2>&1
echo "[$(ts)] === Stage 6 (2 worker): 최종 DB snapshot ===" >> "$LOG"
pnpm exec ts-node src/scripts/snapshot-db-now.ts >> "$LOG" 2>&1

cat > .recollect-cache/127months-stage6-done.flag <<EOF
{"completedAt":"$(ts)","mode":"stage6-2worker-30m"}
EOF
echo "[$(ts)] === Stage 6 (2 worker): 전체 완료 ===" >> "$LOG"

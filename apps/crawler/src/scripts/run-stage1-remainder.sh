#!/bin/bash
# final-sequential.sh 종료 후 Stage 1 retry 미처리 23 ym 재시도
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

# Stage 1 retry 미처리 23 ym (2026-05-07 06:48 KST 분석)
W1_REM="200201 200205 200207 200301 200302 200305 200403 200502 200508 200602 200603 200703 200801 200803 200901"
W2_REM="201007 201009 201102 201201 201301 201303 201401 201402"

run_step() {
  local step="$1" ym="$2" script="$3"
  local label="rem-${step}-${ym}"
  echo "[$(ts)] [${label}] >>> ts-node ${script} --ym ${ym}" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node "src/scripts/${script}" --ym "$ym" >> "$LOG" 2>&1
  local code=$?
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] [${label}] <<< exit=${code} (${elapsed}s)" >> "$LOG"
  return $code
}

run_ym() {
  local ym="$1"
  run_step collect "$ym" re-collect-month.ts || return 1
  run_step audit   "$ym" audit-recollect.ts  || return 1
  run_step load    "$ym" load-recollect.ts   || return 1
}

worker() {
  local id=$1; shift
  echo "[$(ts)] === [stage1-rem-w${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do run_ym "$ym"; done
  echo "[$(ts)] === [stage1-rem-w${id}] done ===" >> "$LOG"
}

# final-sequential.sh 의 snapshot 완료 sentinel 대기 (mode=final-sequential)
echo "[$(ts)] === stage1-remainder: final-sequential 종료 대기 ===" >> "$LOG"
while true; do
  if grep -q "FINAL: DB snapshot 완료" "$LOG" 2>/dev/null; then
    echo "[$(ts)] === stage1-remainder: final-sequential 완료 감지 ===" >> "$LOG"
    break
  fi
  sleep 60
done

echo "[$(ts)] === stage1-remainder: 23 ym 재시도 시작 ===" >> "$LOG"
worker 1 $W1_REM &
W1_PID=$!
worker 2 $W2_REM &
W2_PID=$!
wait $W1_PID $W2_PID
echo "[$(ts)] === stage1-remainder: 23 ym 재시도 종료 ===" >> "$LOG"

# 최종 verify 재실행
echo "[$(ts)] === stage1-remainder: verify 재실행 ===" >> "$LOG"
pnpm exec ts-node src/scripts/verify-totalcount.ts >> "$LOG" 2>&1

# 최종 snapshot
echo "[$(ts)] === stage1-remainder: 최종 DB snapshot ===" >> "$LOG"
pnpm exec ts-node src/scripts/snapshot-db-now.ts >> "$LOG" 2>&1

cat > .recollect-cache/127months-remainder-done.flag <<EOF
{"completedAt":"$(ts)","mode":"stage1-remainder-23m"}
EOF
echo "[$(ts)] === stage1-remainder: 전체 완료 ===" >> "$LOG"

#!/bin/bash
# verify 결과 미완료 92월 본체 재수집 (Stage 1 retry)
# 모든 데이터 수집 제1원칙
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"

ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

run_step() {
  local step="$1" ym="$2" script="$3"
  local label="92m-stage1-${step}-${ym}"
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

worker_stage1() {
  local id=$1; shift
  echo "[$(ts)] === [stage1-retry-worker-${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do run_ym "$ym"; done
  echo "[$(ts)] === [stage1-retry-worker-${id}] done ===" >> "$LOG"
}

# 92월 미완료 list (verify-totalcount-result.json 기준)
W1_YMS="200201 200202 200203 200204 200205 200206 200207 200208 200209 200210 200211 200212 200301 200302 200303 200305 200310 200311 200401 200402 200403 200409 200410 200501 200502 200503 200506 200508 200509 200601 200602 200603 200701 200702 200703 200801 200802 200803 200901 201001 201007 201009 201010 201101 201102 201201"
W2_YMS="201301 201303 201401 201402 201403 201411 201501 201503 201511 201601 201602 201606 201609 201610 201701 201702 201711 201801 201810 201811 201901 201910 201911 202001 202002 202008 202010 202011 202101 202102 202111 202201 202210 202211 202301 202310 202311 202401 202409 202410 202411 202501 202502 202510 202511 202601"

echo "[$(ts)] === fast: 92월 본체 Stage 1 재수집 시작 ===" >> "$LOG"
worker_stage1 1 $W1_YMS &
W1_PID=$!
worker_stage1 2 $W2_YMS &
W2_PID=$!
wait $W1_PID $W2_PID
echo "[$(ts)] === fast: 92월 본체 Stage 1 재수집 종료 ===" >> "$LOG"

cat > .recollect-cache/127months-stage1-retry-done.flag <<EOF
{"completedAt":"$(ts)","mode":"stage1-retry-92m"}
EOF
echo "[$(ts)] === stage1-retry sentinel 기록 ===" >> "$LOG"

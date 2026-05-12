#!/bin/bash
# 127월 재수집 5 worker 병렬 (Stage 2 잔여 38월 + Stage 3 127월 + Stage 4 verify + sentinel)
# wrapper run-127months.ts와 동일 log 형식 출력 → 기존 monitor 그대로 작동
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"

ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

run_step() {
  local stage="$1"  # extras | bid
  local step="$2"   # collect | audit | load
  local ym="$3"
  local script="$4"
  local label="127m-${stage}-${step}-${ym}"
  echo "[$(ts)] [${label}] >>> ts-node ${script} --ym ${ym}" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node "src/scripts/${script}" --ym "$ym" >> "$LOG" 2>&1
  local code=$?
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] [${label}] <<< exit=${code} (${elapsed}s)" >> "$LOG"
  return $code
}

run_extras_ym() {
  local ym="$1"
  run_step extras collect "$ym" re-collect-extras-month.ts || return 1
  run_step extras audit   "$ym" audit-extras.ts            || return 1
  run_step extras load    "$ym" load-extras.ts             || return 1
}

run_bid_ym() {
  local ym="$1"
  run_step bid collect "$ym" re-collect-bid-month.ts || return 1
  run_step bid audit   "$ym" audit-bid.ts            || return 1
  run_step bid load    "$ym" load-bid.ts             || return 1
}

worker_extras() {
  local id=$1; shift
  echo "[$(ts)] === [worker-extras-${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do run_extras_ym "$ym"; done
  echo "[$(ts)] === [worker-extras-${id}] done ===" >> "$LOG"
}

worker_bid() {
  local id=$1; shift
  echo "[$(ts)] === [worker-bid-${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do run_bid_ym "$ym"; done
  echo "[$(ts)] === [worker-bid-${id}] done ===" >> "$LOG"
}

# Stage 2 (extras) 5 worker — 잔여 38월 평등 분할
echo "[$(ts)] === 2단계: extras 5 worker 병렬 시작 (38월) ===" >> "$LOG"
worker_extras 1 202011 202012 202101 202102 202103 202104 202105 202106 &
worker_extras 2 202107 202108 202109 202110 202111 202112 202201 202202 &
worker_extras 3 202203 202204 202205 202206 202207 202208 202209 202210 &
worker_extras 4 202211 202301 202310 202311 202401 202404 202405 202409 &
worker_extras 5 202410 202411 202501 202502 202510 202511 202601 &
wait
echo "[$(ts)] === 2단계: extras 5 worker 모두 종료 ===" >> "$LOG"

# Stage 3 (bid) 5 worker — 127월 평등 분할
echo "[$(ts)] === 3단계: bid 5 worker 병렬 시작 (127월) ===" >> "$LOG"
worker_bid 1 200201 200202 200203 200204 200205 200206 200207 200208 200209 200210 200211 200212 200301 200302 200303 200305 200310 200311 200401 200402 200403 200409 200410 200501 200502 &
worker_bid 2 200503 200506 200508 200509 200601 200602 200603 200701 200702 200703 200704 200801 200802 200803 200901 201001 201007 201009 201010 201101 201102 201201 201301 201303 201401 &
worker_bid 3 201402 201403 201404 201407 201408 201411 201501 201502 201503 201504 201508 201509 201511 201601 201602 201603 201606 201607 201608 201609 201610 201611 201701 201702 201711 &
worker_bid 4 201801 201810 201811 201901 201910 201911 202001 202002 202006 202007 202008 202009 202010 202011 202012 202101 202102 202103 202104 202105 202106 202107 202108 202109 202110 &
worker_bid 5 202111 202112 202201 202202 202203 202204 202205 202206 202207 202208 202209 202210 202211 202301 202310 202311 202401 202404 202405 202409 202410 202411 202501 202502 202510 202511 202601 &
wait
echo "[$(ts)] === 3단계: bid 5 worker 모두 종료 ===" >> "$LOG"

# Stage 4 verify
echo "[$(ts)] === 4단계: verify-totalcount 시작 ===" >> "$LOG"
pnpm exec ts-node src/scripts/verify-totalcount.ts >> "$LOG" 2>&1
verify_code=$?
echo "[$(ts)] === 4단계: verify 종료 exit=${verify_code} ===" >> "$LOG"

# Sentinel
cat > .recollect-cache/127months-done.flag <<EOF
{
  "completedAt": "$(ts)",
  "mode": "5-worker-parallel",
  "verifyExit": ${verify_code}
}
EOF
echo "[$(ts)] sentinel: 127months-done.flag 기록" >> "$LOG"
echo "[$(ts)] === 5 worker 병렬 전체 종료 ===" >> "$LOG"

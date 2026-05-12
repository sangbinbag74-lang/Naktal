#!/bin/bash
# Stage 2 잔여 34월 retry (5 worker 종료 후 자동 chain 실행)
# 5 worker가 미처리한 ym들을 2 worker로 깔끔하게 다시 적재
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"

ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

run_step() {
  local stage="$1" step="$2" ym="$3" script="$4"
  local label="127m-retry-${stage}-${step}-${ym}"
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
  echo "[$(ts)] === [retry-extras-worker-${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do run_extras_ym "$ym"; done
  echo "[$(ts)] === [retry-extras-worker-${id}] done ===" >> "$LOG"
}

worker_bid() {
  local id=$1; shift
  echo "[$(ts)] === [retry-bid-worker-${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do run_bid_ym "$ym"; done
  echo "[$(ts)] === [retry-bid-worker-${id}] done ===" >> "$LOG"
}

ALL_127="200201 200202 200203 200204 200205 200206 200207 200208 200209 200210 200211 200212 200301 200302 200303 200305 200310 200311 200401 200402 200403 200409 200410 200501 200502 200503 200506 200508 200509 200601 200602 200603 200701 200702 200703 200704 200801 200802 200803 200901 201001 201007 201009 201010 201101 201102 201201 201301 201303 201401 201402 201403 201404 201407 201408 201411 201501 201502 201503 201504 201508 201509 201511 201601 201602 201603 201606 201607 201608 201609 201610 201611 201701 201702 201711 201801 201810 201811 201901 201910 201911 202001 202002 202006 202007 202008 202009 202010 202011 202012 202101 202102 202103 202104 202105 202106 202107 202108 202109 202110 202111 202112 202201 202202 202203 202204 202205 202206 202207 202208 202209 202210 202211 202301 202310 202311 202401 202404 202405 202409 202410 202411 202501 202502 202510 202511 202601"

compute_missing() {
  local stage="$1"  # extras | bid
  local pat="\[127m-(fast-)?${stage}-load-[0-9]+\] >>>"
  local DONE_YMS=$(grep -oE "$pat" "$LOG" 2>/dev/null | grep -oE "[0-9]{6}" | sort -u | tr '\n' ' ')
  local out=""
  for ym in $ALL_127; do
    if ! echo " $DONE_YMS " | grep -q " $ym "; then out="$out $ym"; fi
  done
  echo "$out"
}

# Stage 2 (extras) 누락 ym retry
EXTRAS_MISSING=$(compute_missing extras)
EXTRAS_ARR=($EXTRAS_MISSING)
EN=${#EXTRAS_ARR[@]}
echo "[$(ts)] === retry: 미적재 extras ym=${EN}월 ===" >> "$LOG"
echo "[$(ts)]     extras list: $EXTRAS_MISSING" >> "$LOG"
if [ "$EN" -gt 0 ]; then
  EHALF=$(( (EN + 1) / 2 ))
  EW1="${EXTRAS_ARR[@]:0:$EHALF}"
  EW2="${EXTRAS_ARR[@]:$EHALF}"
  worker_extras 1 $EW1 &
  EW1_PID=$!
  worker_extras 2 $EW2 &
  EW2_PID=$!
  wait $EW1_PID $EW2_PID
  echo "[$(ts)] === retry extras 종료 ===" >> "$LOG"
else
  echo "[$(ts)] retry extras: 미적재 0 — skip" >> "$LOG"
fi

# Stage 3 (bid) 누락 ym retry
BID_MISSING=$(compute_missing bid)
BID_ARR=($BID_MISSING)
BN=${#BID_ARR[@]}
echo "[$(ts)] === retry: 미적재 bid ym=${BN}월 ===" >> "$LOG"
echo "[$(ts)]     bid list: $BID_MISSING" >> "$LOG"
if [ "$BN" -gt 0 ]; then
  BHALF=$(( (BN + 1) / 2 ))
  BW1="${BID_ARR[@]:0:$BHALF}"
  BW2="${BID_ARR[@]:$BHALF}"
  worker_bid 1 $BW1 &
  BW1_PID=$!
  worker_bid 2 $BW2 &
  BW2_PID=$!
  wait $BW1_PID $BW2_PID
  echo "[$(ts)] === retry bid 종료 ===" >> "$LOG"
else
  echo "[$(ts)] retry bid: 미적재 0 — skip" >> "$LOG"
fi

echo "[$(ts)] === retry: 모든 worker 종료 ===" >> "$LOG"

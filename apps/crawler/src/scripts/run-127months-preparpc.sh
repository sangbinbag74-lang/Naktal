#!/bin/bash
# 127월 PreparPcDetail 4 op 수집 (예비가 상세 — 누락 발견 후 추가, 2026-05-06)
# 제1원칙: 모든 데이터 수집 (ML 미적용 ≠ 수집 폐기)
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"

ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker_preparpc() {
  local id=$1; shift
  echo "[$(ts)] === [preparpc-worker-${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do
    echo "[$(ts)] [preparpc-${ym}] >>> bulk-opening-preparpc --from $ym --to $ym" >> "$LOG"
    local t0=$(date +%s)
    pnpm exec ts-node src/bulk-opening-preparpc.ts --from $ym --to $ym >> "$LOG" 2>&1
    local code=$?
    local elapsed=$(( $(date +%s) - t0 ))
    echo "[$(ts)] [preparpc-${ym}] <<< exit=${code} (${elapsed}s)" >> "$LOG"
  done
  echo "[$(ts)] === [preparpc-worker-${id}] done ===" >> "$LOG"
}

# 127월 평등 분할 (2 worker)
echo "[$(ts)] === fast: PreparPcDetail 수집 시작 (127월) ===" >> "$LOG"
worker_preparpc 1 200201 200202 200203 200204 200205 200206 200207 200208 200209 200210 200211 200212 200301 200302 200303 200305 200310 200311 200401 200402 200403 200409 200410 200501 200502 200503 200506 200508 200509 200601 200602 200603 200701 200702 200703 200704 200801 200802 200803 200901 201001 201007 201009 201010 201101 201102 201201 201301 201303 201401 201402 201403 201404 201407 201408 201411 201501 201502 201503 201504 201508 201509 201511 201601 &
W1_PID=$!
worker_preparpc 2 201602 201603 201606 201607 201608 201609 201610 201611 201701 201702 201711 201801 201810 201811 201901 201910 201911 202001 202002 202006 202007 202008 202009 202010 202011 202012 202101 202102 202103 202104 202105 202106 202107 202108 202109 202110 202111 202112 202201 202202 202203 202204 202205 202206 202207 202208 202209 202210 202211 202301 202310 202311 202401 202404 202405 202409 202410 202411 202501 202502 202510 202511 202601 &
W2_PID=$!
wait $W1_PID $W2_PID
echo "[$(ts)] === fast: PreparPcDetail 수집 종료 ===" >> "$LOG"

cat > .recollect-cache/127months-preparpc-done.flag <<EOF
{"completedAt":"$(ts)","mode":"preparpc-127m"}
EOF
echo "[$(ts)] === preparpc sentinel 기록 ===" >> "$LOG"

#!/bin/bash
# 극한 가속: timeout 10s + retry 1 + BATCH 50
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-fast.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [yw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [yw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === FAST 극한 worker 시작 ===" >> "$LOG"

# 미완 영역 잘게 (3 ym 씩)
worker 1 201001 201003 &
worker 2 201004 201006 &
worker 3 201007 201009 &
worker 4 201010 201012 &
worker 5 201101 201103 &
worker 6 201104 201106 &
worker 7 201501 201503 &
worker 8 201504 201506 &
worker 9 201801 201803 &
worker 10 201804 201806 &

wait
echo "[$(ts)] === FAST 종료 ===" >> "$LOG"

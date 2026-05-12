#!/bin/bash
# w1 미완 영역 (200811~200912) 추가 4 worker — w1 살린 채 데이터 완료 가속
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/w1-tail-extra.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [tw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [tw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === w1 tail 추가 4 worker 시작 ===" >> "$LOG"

worker 1 200811 200811 &
worker 2 200812 200903 &
worker 3 200904 200907 &
worker 4 200908 200912 &

wait
echo "[$(ts)] === w1 tail 종료 ===" >> "$LOG"

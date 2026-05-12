#!/bin/bash
# rw1 마지막 6 ym 추가 분할
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rw1-final.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [qw${id}] start opening ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-opening.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [qw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === rw1 final 3 worker 시작 ===" >> "$LOG"

worker 1 200507 200508 &
worker 2 200509 200510 &
worker 3 200511 200512 &

wait
echo "[$(ts)] === rw1 final 종료 ===" >> "$LOG"

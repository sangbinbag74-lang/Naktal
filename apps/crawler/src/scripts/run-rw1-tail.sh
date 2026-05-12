#!/bin/bash
# rw1 미완 영역 (200410~200612) 추가 4 분할 — 빠른 종료
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rw1-tail.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [pw${id}] start opening ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-opening.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [pw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === rw1 tail 4 worker 시작 ===" >> "$LOG"

worker 1 200410 200506 &
worker 2 200507 200512 &
worker 3 200601 200606 &
worker 4 200607 200612 &

wait
echo "[$(ts)] === rw1 tail 종료 ===" >> "$LOG"

#!/bin/bash
# w6 가속 — opening 201301~현재 4 분할 추가 worker (w6 kill 안 함, idempotent)
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/w6-extra-split.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [zw${id}] start opening ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-opening.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [zw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === w6 가속 4 worker 시작 ===" >> "$LOG"

worker 1 201301 201706 &
worker 2 201707 202012 &
worker 3 202101 202308 &
worker 4 202309 $(date +%Y%m) &

wait
echo "[$(ts)] === w6 가속 종료 ===" >> "$LOG"

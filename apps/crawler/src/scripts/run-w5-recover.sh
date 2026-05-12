#!/bin/bash
# w5 보충 — opening 200201~201212 4 분할 (제 임의 종료 영향 회복)
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/w5-recover.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [rw${id}] start opening ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-opening.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [rw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === w5 회복 4 worker 시작 ===" >> "$LOG"

worker 1 200201 200612 &
worker 2 200701 200912 &
worker 3 201001 201106 &
worker 4 201107 201212 &

wait
echo "[$(ts)] === w5 회복 종료 ===" >> "$LOG"

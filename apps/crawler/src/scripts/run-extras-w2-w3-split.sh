#!/bin/bash
# w2 + w3 가속 — 각 4 분할
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-w2-w3-split.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [sw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [sw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === w2 + w3 분할 8 worker 시작 ===" >> "$LOG"

# w2 (201001~201412, 60 ym) 4 분할
worker 2A 201001 201106 &
worker 2B 201107 201212 &
worker 2C 201301 201406 &
worker 2D 201407 201412 &

# w3 (201501~201912, 60 ym) 4 분할
worker 3A 201501 201606 &
worker 3B 201607 201712 &
worker 3C 201801 201906 &
worker 3D 201907 201912 &

wait
echo "[$(ts)] === w2 + w3 분할 8 worker 종료 ===" >> "$LOG"

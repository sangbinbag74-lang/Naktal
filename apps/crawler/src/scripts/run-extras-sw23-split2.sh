#!/bin/bash
# sw23 추가 분할 — 가장 느린 sw3C, sw3D 만 가속 (효과 큰 영역)
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-sw23-split2.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [tw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [tw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === sw23 추가 분할 worker 시작 ===" >> "$LOG"

# sw3C 분할 (201801~201906, 18 ym → 2 분할)
worker 3C1 201801 201812 &
worker 3C2 201901 201906 &

# sw2A 분할 (201001~201106, 18 ym → 2 분할 - 가장 큰 효과)
worker 2A1 201001 201106 &

# sw3A 분할 (201501~201606, 18 ym → 2 분할)
worker 3A1 201501 201606 &

wait
echo "[$(ts)] === sw23 추가 분할 worker 종료 ===" >> "$LOG"

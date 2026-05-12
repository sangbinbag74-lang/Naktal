#!/bin/bash
# w1 가속 — extras 200201~200912 4 분할 (각 24 ym)
# w1 와 ym 중복 가능하나 idempotent UPSERT 라 안전
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-w1-extra-4w.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [ew${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [ew${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === extras 추가 4 worker (w1 가속) 시작 ===" >> "$LOG"

# 200201~200912 (96 ym) → 4 분할
worker A 200201 200312 &
worker B 200401 200512 &
worker C 200601 200712 &
worker D 200801 200912 &

wait
echo "[$(ts)] === extras 추가 4 worker 종료 ===" >> "$LOG"

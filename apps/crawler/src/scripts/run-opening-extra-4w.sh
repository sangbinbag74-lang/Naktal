#!/bin/bash
# w6 가속 — opening 201301~현재 4 분할 (각 ~40 ym)
# w6 와 ym 중복 가능하나 idempotent UPSERT 라 안전
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/opening-extra-4w.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [ow${id}] start opening ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-opening.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [ow${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === opening 추가 4 worker (w6 가속) 시작 ===" >> "$LOG"

# 201301~현재 (약 161 ym) → 4 분할
worker A 201301 201612 &
worker B 201701 201912 &
worker C 202001 202212 &
worker D 202301 $(date +%Y%m) &

wait
echo "[$(ts)] === opening 추가 4 worker 종료 ===" >> "$LOG"

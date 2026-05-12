#!/bin/bash
# w4 가속 — extras 202001~현재 4 분할 (각 약 19 ym)
# w4 와 ym 중복 가능하나 idempotent UPSERT 라 안전
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-w4-extra-4w.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [fw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [fw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === extras 추가 4 worker (w4 가속) 시작 ===" >> "$LOG"

# 202001~202605 (약 77 ym) → 4 분할
worker A 202001 202112 &
worker B 202201 202312 &
worker C 202401 202512 &
worker D 202601 $(date +%Y%m) &

wait
echo "[$(ts)] === extras 추가 4 worker (w4) 종료 ===" >> "$LOG"

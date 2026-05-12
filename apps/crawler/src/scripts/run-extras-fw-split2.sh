#!/bin/bash
# fwA·B·C 추가 분할 (각 24 ym → 12 ym × 2 = 6 worker)
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-fw-split2.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [uw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [uw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === fw 추가 분할 6 worker 시작 ===" >> "$LOG"

worker A1 202001 202012 &
worker A2 202101 202112 &
worker B1 202201 202212 &
worker B2 202301 202312 &
worker C1 202401 202412 &
worker C2 202501 202512 &

wait
echo "[$(ts)] === fw 추가 분할 종료 ===" >> "$LOG"

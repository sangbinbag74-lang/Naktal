#!/bin/bash
# BATCH 20 적용 신규 worker — sw23 가장 느린 영역 추가 가속
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-batch20-extra.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [xw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [xw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === BATCH20 추가 worker 시작 ===" >> "$LOG"

# 가장 느린 sw23 18 ym worker 영역 — 6 ym 씩 잘게 분할
worker A 201001 201006 &
worker B 201007 201012 &
worker C 201101 201106 &
worker D 201107 201112 &
worker E 201201 201206 &
worker F 201207 201212 &
worker G 201301 201306 &
worker H 201307 201312 &

wait
echo "[$(ts)] === BATCH20 종료 ===" >> "$LOG"

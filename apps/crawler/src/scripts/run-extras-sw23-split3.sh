#!/bin/bash
# sw23 6 worker (18 ym) 각 9 ym 절반 추가 분할 = 6 추가 worker
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-sw23-split3.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [vw${id}] start extras ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [vw${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === sw23 추가 분할 6 worker 시작 ===" >> "$LOG"

# 각 18 ym 의 후반부 9 ym 만 추가 처리 (전반부는 sw23 본체가 처리 중)
worker 2A2 201010 201106 &
worker 2B2 201204 201212 &
worker 2C2 201310 201406 &
worker 3A2 201510 201606 &
worker 3B2 201704 201712 &
worker 3C2x 201810 201906 &

wait
echo "[$(ts)] === sw23 추가 분할 종료 ===" >> "$LOG"

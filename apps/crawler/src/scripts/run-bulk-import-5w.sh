#!/bin/bash
# bulk-import 270 ym (200201~202404) 5 worker 병렬
# 사용자 명시 승인 (2026-05-08): "해봐"
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/bulk-import-5w.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

# 270 ym 을 5 worker 로 분할 (각 ~54 ym)
W1_FROM=200201; W1_TO=200612
W2_FROM=200701; W2_TO=201112
W3_FROM=201201; W3_TO=201612
W4_FROM=201701; W4_TO=202012
W5_FROM=202101; W5_TO=202404

worker() {
  local id=$1 from=$2 to=$3
  echo "[$(ts)] === [w${id}] start (${from}~${to}) ===" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-import.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [w${id}] done (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === bulk-import 5 worker 시작 (270 ym 분할) ===" >> "$LOG"
worker 1 $W1_FROM $W1_TO &
worker 2 $W2_FROM $W2_TO &
worker 3 $W3_FROM $W3_TO &
worker 4 $W4_FROM $W4_TO &
worker 5 $W5_FROM $W5_TO &
wait
echo "[$(ts)] === bulk-import 5 worker 종료 ===" >> "$LOG"

cat > .recollect-cache/bulk-import-5w-done.flag <<EOF
{"completedAt":"$(ts)","mode":"bulk-import-5w-270m"}
EOF

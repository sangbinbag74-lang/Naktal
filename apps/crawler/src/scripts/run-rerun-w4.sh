#!/bin/bash
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rerun-w4.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
echo "[$(ts)] === rerun W4 시작 (201601~201912) ===" >> "$LOG"
pnpm exec ts-node src/bulk-import-extras-v2.ts --from 201601 --to 201912 >> "$LOG" 2>&1
echo "[$(ts)] === rerun W4 종료 ===" >> "$LOG"

#!/bin/bash
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rerun-w1.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
echo "[$(ts)] === rerun W1 시작 (200201~200612) ===" >> "$LOG"
pnpm exec ts-node src/bulk-import-extras-v2.ts --from 200201 --to 200612 >> "$LOG" 2>&1
echo "[$(ts)] === rerun W1 종료 ===" >> "$LOG"

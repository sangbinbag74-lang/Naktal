#!/bin/bash
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rerun-w6.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
echo "[$(ts)] === rerun W6 시작 (202307~202605) ===" >> "$LOG"
pnpm exec ts-node src/bulk-import-extras-v2.ts --from 202307 --to 202605 >> "$LOG" 2>&1
echo "[$(ts)] === rerun W6 종료 ===" >> "$LOG"

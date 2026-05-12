#!/bin/bash
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rerun-w5.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
echo "[$(ts)] === rerun W5 시작 (202001~202306) ===" >> "$LOG"
pnpm exec ts-node src/bulk-import-extras-v2.ts --from 202001 --to 202306 >> "$LOG" 2>&1
echo "[$(ts)] === rerun W5 종료 ===" >> "$LOG"

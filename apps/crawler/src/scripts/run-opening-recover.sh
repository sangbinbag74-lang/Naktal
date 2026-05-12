#!/bin/bash
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/opening-recover.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
echo "[$(ts)] === opening-local 14ym 재시작 (200811~200912) ===" >> "$LOG"
pnpm exec ts-node src/bulk-opening.ts --from 200811 --to 200912 >> "$LOG" 2>&1
echo "[$(ts)] === opening-local 14ym 종료 ===" >> "$LOG"

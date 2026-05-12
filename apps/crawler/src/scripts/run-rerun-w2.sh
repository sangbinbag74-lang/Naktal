#!/bin/bash
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rerun-w2.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
echo "[$(ts)] === rerun W2 시작 (200701~201112) ===" >> "$LOG"
pnpm exec ts-node src/bulk-import-extras-v2.ts --from 200701 --to 201112 >> "$LOG" 2>&1
echo "[$(ts)] === rerun W2 종료 ===" >> "$LOG"

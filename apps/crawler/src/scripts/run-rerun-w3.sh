#!/bin/bash
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/rerun-w3.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }
echo "[$(ts)] === rerun W3 시작 (201201~201512) ===" >> "$LOG"
pnpm exec ts-node src/bulk-import-extras-v2.ts --from 201201 --to 201512 >> "$LOG" 2>&1
echo "[$(ts)] === rerun W3 종료 ===" >> "$LOG"

#!/bin/bash
# 로컬 5워커: extras × 4 (4분할) + opening × 2 (2분할) = 6 worker 병렬
# 사용자 명시 (2026-05-08): GH Actions cancel + 로컬 재시작
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/extras-opening-local.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

worker() {
  local id=$1 cmd=$2 from=$3 to=$4
  echo "[$(ts)] === [w${id}] start ${cmd} ${from}~${to} ===" >> "$LOG"
  local t0=$(date +%s)
  if [ "$cmd" = "extras" ]; then
    pnpm exec ts-node src/bulk-import-extras-v2.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  else
    pnpm exec ts-node src/bulk-opening.ts --from "$from" --to "$to" >> "$LOG" 2>&1
  fi
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] === [w${id}] done ${cmd} (${elapsed}s) ===" >> "$LOG"
}

echo "[$(ts)] === extras + opening 로컬 6 워커 시작 ===" >> "$LOG"

# extras 4 분할: 200201~200912 / 201001~201412 / 201501~201912 / 202001~현재
worker 1 extras  200201 200912 &
worker 2 extras  201001 201412 &
worker 3 extras  201501 201912 &
worker 4 extras  202001 $(date +%Y%m) &

# opening 2 분할
worker 5 opening 200201 201212 &
worker 6 opening 201301 $(date +%Y%m) &

wait
echo "[$(ts)] === extras + opening 로컬 6 워커 종료 ===" >> "$LOG"

cat > .recollect-cache/extras-opening-local-done.flag <<EOF
{"completedAt":"$(ts)","mode":"extras-opening-local-6w"}
EOF

#!/bin/bash
# F 플랜: W2 kill 후 잔여 56 ym 을 W3+W4 2 워커 병렬 처리
# 사용자 승인 (2026-05-07): F (W3 spawn) 진행
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

# W2 잔여 56 ym 분할 (절반씩)
W3_YMS="201611 201701 201702 201711 201801 201810 201811 201901 201910 201911 202001 202002 202006 202007 202008 202009 202010 202011 202012 202101 202102 202103 202104 202105 202106 202107 202108 202109"
W4_YMS="202110 202111 202112 202201 202202 202203 202204 202205 202206 202207 202208 202209 202210 202211 202301 202310 202311 202401 202404 202405 202409 202410 202411 202501 202502 202510 202511 202601"

worker_pre() {
  local id=$1; shift
  echo "[$(ts)] === [prep-w${id}] start (${#} ym) ===" >> "$LOG"
  for ym in "$@"; do
    echo "[$(ts)] [prep-w${id}-${ym}] >>>" >> "$LOG"
    local t0=$(date +%s)
    pnpm exec ts-node src/bulk-opening-preparpc.ts --from "$ym" --to "$ym" >> "$LOG" 2>&1
    local code=$?
    local elapsed=$(( $(date +%s) - t0 ))
    echo "[$(ts)] [prep-w${id}-${ym}] <<< exit=${code} (${elapsed}s)" >> "$LOG"
  done
  echo "[$(ts)] === [prep-w${id}] done ===" >> "$LOG"
}

echo "[$(ts)] === F: W3+W4 PreparPc 병렬 시작 (각 28 ym) ===" >> "$LOG"
worker_pre 3 $W3_YMS &
W3_PID=$!
worker_pre 4 $W4_YMS &
W4_PID=$!
wait $W3_PID $W4_PID
echo "[$(ts)] === F: W3+W4 종료 ===" >> "$LOG"

# 최종 검증 + snapshot (final-sequential 의 verify+snapshot 이미 끝났을 수 있음, 보강)
echo "[$(ts)] === F: 최종 verify-totalcount ===" >> "$LOG"
pnpm exec ts-node src/scripts/verify-totalcount.ts >> "$LOG" 2>&1
echo "[$(ts)] === F: 최종 DB snapshot ===" >> "$LOG"
pnpm exec ts-node src/scripts/snapshot-db-now.ts >> "$LOG" 2>&1

cat > .recollect-cache/127months-w3w4-done.flag <<EOF
{"completedAt":"$(ts)","mode":"prep-w3w4-56m"}
EOF
echo "[$(ts)] === F: 전체 완료 ===" >> "$LOG"

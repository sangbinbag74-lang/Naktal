#!/bin/bash
# Stage 6: W4 backlog (25 ym 미처리) + abort-affected ym 재처리
# 사용자 승인 (2026-05-07): 6까지 자동 실행
# W3 종료 대기 후 단일 worker 안전 처리
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

# 정정 (2026-05-07): kill 한 게 W4 가 아닌 W3 였음 (PID 매핑 오류)
# 실제 살아있는 건 W4 (25743), W3 (25742) 가 죽음.
# W3 backlog = W3 list 의 미완 24 ym (W3 가 4 ym 만 처리하고 죽음: 201611, 201701, 201702, 201711)
W3_BACKLOG="201801 201810 201811 201901 201910 201911 202001 202002 202006 202007 202008 202009 202010 202011 202012 202101 202102 202103 202104 202105 202106 202107 202108 202109"

# W3 의 abort 발생 ym (재처리 필요, 안전한 batch=7 단일 worker 로)
# W4 의 abort 발생 ym 도 살아있는 W4 가 batch=7 로 재처리할 수 있게 추가
ABORT_AFFECTED="201611 201701 201702 201711 202110 202111 202112"

ALL_YMS="$W3_BACKLOG $ABORT_AFFECTED"

run_ym() {
  local ym="$1"
  local label="stage6-${ym}"
  echo "[$(ts)] [${label}] >>> bulk-opening-preparpc --from $ym --to $ym" >> "$LOG"
  local t0=$(date +%s)
  pnpm exec ts-node src/bulk-opening-preparpc.ts --from "$ym" --to "$ym" >> "$LOG" 2>&1
  local code=$?
  local elapsed=$(( $(date +%s) - t0 ))
  echo "[$(ts)] [${label}] <<< exit=${code} (${elapsed}s)" >> "$LOG"
}

# W3+W4 종료 대기 (run-prep-w3.sh 의 sentinel)
echo "[$(ts)] === Stage 6: W3+W4 종료 대기 ===" >> "$LOG"
while true; do
  if [ -f .recollect-cache/127months-w3w4-done.flag ]; then
    echo "[$(ts)] === Stage 6: W3+W4 sentinel 감지 ===" >> "$LOG"
    break
  fi
  sleep 60
done

# Stage 5 (Stage1 remainder) 종료 대기
echo "[$(ts)] === Stage 6: Stage 5 종료 대기 ===" >> "$LOG"
while true; do
  if [ -f .recollect-cache/127months-remainder-done.flag ]; then
    echo "[$(ts)] === Stage 6: Stage 5 sentinel 감지 ===" >> "$LOG"
    break
  fi
  sleep 60
done

echo "[$(ts)] === Stage 6: W4 backlog + abort-affected 단일 worker 시작 ($(echo $ALL_YMS | wc -w) ym) ===" >> "$LOG"
for ym in $ALL_YMS; do
  run_ym "$ym"
done
echo "[$(ts)] === Stage 6: 단일 worker 처리 종료 ===" >> "$LOG"

# 최종 verify + snapshot (전체 작업의 진짜 끝)
echo "[$(ts)] === Stage 6: 최종 verify-totalcount ===" >> "$LOG"
pnpm exec ts-node src/scripts/verify-totalcount.ts >> "$LOG" 2>&1
echo "[$(ts)] === Stage 6: 최종 DB snapshot ===" >> "$LOG"
pnpm exec ts-node src/scripts/snapshot-db-now.ts >> "$LOG" 2>&1

cat > .recollect-cache/127months-stage6-done.flag <<EOF
{"completedAt":"$(ts)","mode":"stage6-w4-backlog-30m"}
EOF
echo "[$(ts)] === Stage 6: 전체 완료 — 모든 작업 종료 ===" >> "$LOG"

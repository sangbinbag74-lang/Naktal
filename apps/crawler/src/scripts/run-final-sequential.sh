#!/bin/bash
# 최종 sequential — Stage 1 retry + Opening + Preparpc + verify (각 stage 안 2 worker, stage 간 sequential)
set -u
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
LOG=".recollect-cache/127months.log"
ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

source .recollect-cache/.remain.sh

S1_ARR=($S1)
OPN_ARR=($OPN)
PRE_ARR=($PRE)

# 2 worker 분할
half() { local arr=("$@"); local n=${#arr[@]}; local h=$(( (n+1)/2 )); echo $h; }

# Stage 1 retry
echo "[$(ts)] === FINAL: Stage 1 retry (${#S1_ARR[@]}월) ===" >> "$LOG"
H1=$(( (${#S1_ARR[@]}+1)/2 ))
S1_W1="${S1_ARR[@]:0:$H1}"
S1_W2="${S1_ARR[@]:$H1}"

(
  for ym in $S1_W1; do
    echo "[$(ts)] [final-S1-W1-$ym] >>>" >> "$LOG"
    pnpm exec ts-node src/scripts/re-collect-month.ts --ym $ym >> "$LOG" 2>&1 && \
    pnpm exec ts-node src/scripts/audit-recollect.ts --ym $ym >> "$LOG" 2>&1 && \
    pnpm exec ts-node src/scripts/load-recollect.ts --ym $ym >> "$LOG" 2>&1
    echo "[$(ts)] [final-S1-W1-$ym] <<<" >> "$LOG"
  done
) &
P1=$!
(
  for ym in $S1_W2; do
    echo "[$(ts)] [final-S1-W2-$ym] >>>" >> "$LOG"
    pnpm exec ts-node src/scripts/re-collect-month.ts --ym $ym >> "$LOG" 2>&1 && \
    pnpm exec ts-node src/scripts/audit-recollect.ts --ym $ym >> "$LOG" 2>&1 && \
    pnpm exec ts-node src/scripts/load-recollect.ts --ym $ym >> "$LOG" 2>&1
    echo "[$(ts)] [final-S1-W2-$ym] <<<" >> "$LOG"
  done
) &
P2=$!
wait $P1 $P2
echo "[$(ts)] === FINAL: Stage 1 종료 ===" >> "$LOG"

# Opening
echo "[$(ts)] === FINAL: Opening (${#OPN_ARR[@]}월) ===" >> "$LOG"
H1=$(( (${#OPN_ARR[@]}+1)/2 ))
OPN_W1="${OPN_ARR[@]:0:$H1}"
OPN_W2="${OPN_ARR[@]:$H1}"

(
  for ym in $OPN_W1; do
    echo "[$(ts)] [final-OPN-W1-$ym] >>>" >> "$LOG"
    pnpm exec ts-node src/bulk-opening.ts --from $ym --to $ym >> "$LOG" 2>&1
    echo "[$(ts)] [final-OPN-W1-$ym] <<<" >> "$LOG"
  done
) &
P1=$!
(
  for ym in $OPN_W2; do
    echo "[$(ts)] [final-OPN-W2-$ym] >>>" >> "$LOG"
    pnpm exec ts-node src/bulk-opening.ts --from $ym --to $ym >> "$LOG" 2>&1
    echo "[$(ts)] [final-OPN-W2-$ym] <<<" >> "$LOG"
  done
) &
P2=$!
wait $P1 $P2
echo "[$(ts)] === FINAL: Opening 종료 ===" >> "$LOG"

# Preparpc
echo "[$(ts)] === FINAL: Preparpc (${#PRE_ARR[@]}월) ===" >> "$LOG"
H1=$(( (${#PRE_ARR[@]}+1)/2 ))
PRE_W1="${PRE_ARR[@]:0:$H1}"
PRE_W2="${PRE_ARR[@]:$H1}"

(
  for ym in $PRE_W1; do
    echo "[$(ts)] [final-PRE-W1-$ym] >>>" >> "$LOG"
    pnpm exec ts-node src/bulk-opening-preparpc.ts --from $ym --to $ym >> "$LOG" 2>&1
    echo "[$(ts)] [final-PRE-W1-$ym] <<<" >> "$LOG"
  done
) &
P1=$!
(
  for ym in $PRE_W2; do
    echo "[$(ts)] [final-PRE-W2-$ym] >>>" >> "$LOG"
    pnpm exec ts-node src/bulk-opening-preparpc.ts --from $ym --to $ym >> "$LOG" 2>&1
    echo "[$(ts)] [final-PRE-W2-$ym] <<<" >> "$LOG"
  done
) &
P2=$!
wait $P1 $P2
echo "[$(ts)] === FINAL: Preparpc 종료 ===" >> "$LOG"

# verify
echo "[$(ts)] === FINAL: verify ===" >> "$LOG"
pnpm exec ts-node src/scripts/verify-totalcount.ts >> "$LOG" 2>&1

# sentinel + DB snapshot
cat > .recollect-cache/127months-done.flag <<EOF
{"completedAt":"$(ts)","mode":"final-sequential"}
EOF
echo "[$(ts)] === FINAL: 전체 종료 + sentinel ===" >> "$LOG"

# DB snapshot
pnpm exec ts-node src/scripts/snapshot-db-now.ts >> "$LOG" 2>&1
echo "[$(ts)] === FINAL: DB snapshot 완료 ===" >> "$LOG"

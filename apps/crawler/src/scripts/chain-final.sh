#!/bin/bash
T="C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks"
echo "[chain-final] A·B·C 3 분할 완료 대기..."
while true; do
  ok=0
  for id in b57tuv1j2 brgbh3e4q bi02bfcih; do
    if grep -q "=== v2 완료" "$T/$id.output" 2>/dev/null; then ok=$((ok+1)); fi
  done
  if [ $ok -eq 3 ]; then break; fi
  sleep 120
done
echo "[chain-final] === 3 분할 완료 — 누락 11월 재실행 시작 ==="
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
for ym in 201108 201112 201206 201207 201208 201612 202302 202502 202511 202603 202604; do
  echo "[chain-final] 재실행: $ym"
  pnpm ts-node src/bulk-import-extras-v2.ts --from=$ym --to=$ym
done
echo "[chain-final] === 누락 11월 재실행 완료 — Announcement reparse 시작 ==="
pnpm ts-node src/scripts/reparse-announcement-extras.ts
echo "[chain-final] === Announcement reparse 완료 ==="

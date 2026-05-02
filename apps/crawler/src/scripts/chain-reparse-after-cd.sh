#!/bin/bash
T="C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks"
echo "C/D 3 분할 모두 완료 대기..."
while true; do
  ok=0
  for id in b57tuv1j2 brgbh3e4q bi02bfcih; do
    if grep -q "=== v2 완료" "$T/$id.output" 2>/dev/null; then ok=$((ok+1)); fi
  done
  if [ $ok -eq 3 ]; then break; fi
  sleep 120
done
echo "=== C/D 3 분할 모두 완료 — Announcement reparse 시작 ==="
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
pnpm ts-node src/scripts/reparse-announcement-extras.ts
echo "=== Announcement reparse 완료 ==="

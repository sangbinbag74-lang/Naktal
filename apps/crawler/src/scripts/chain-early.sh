#!/bin/bash
T="C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks"
echo "Pair2 완료 대기..."
while ! grep -q "=== PreparPc 완료" "$T/b6o7v9x9c.output" 2>/dev/null; do
  sleep 60
done
echo "Pair2 완료 — 2002-2009 미완월 시작"
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
pnpm ts-node src/bulk-opening-preparpc.ts --from=200201 --to=200209 && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=200605 --to=200605
echo "=== 전체 체인 완료 ==="

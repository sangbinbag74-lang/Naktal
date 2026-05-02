#!/bin/bash
T="C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks"
echo "Pair1(b33cef88q) 완료 대기..."
while ! grep -q "=== Pair1 완료" "$T/b33cef88q.output" 2>/dev/null; do
  sleep 60
done
echo "Pair1 완료 — Pair2 시작 (201801~202012, 202101~202604)"
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
pnpm ts-node src/bulk-opening-preparpc.ts --from=201801 --to=202012 && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=202101 --to=202604
echo "Pair2 완료 — 2002+2006 미완월 시작"
pnpm ts-node src/bulk-opening-preparpc.ts --from=200201 --to=200209 && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=200605 --to=200605
echo "=== 전체 PreparPc 체인 완료 ==="

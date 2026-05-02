#!/bin/bash
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
echo "=== 전체 체인 (벌크 UPSERT v2) 시작 ==="
echo "단계 1/4: Pair1 G1 (201202~201412)"
pnpm ts-node src/bulk-opening-preparpc.ts --from=201202 --to=201412 && \
echo "=== 단계 2/4: Pair1 G2 (201501~201712) ===" && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=201501 --to=201712 && \
echo "=== 단계 3/4: Pair2 G3 (201801~202012) ===" && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=201801 --to=202012 && \
echo "=== 단계 4/4a: Pair2 G4 (202101~202604) ===" && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=202101 --to=202604 && \
echo "=== 단계 4/4b: 조기 (200201~200209) ===" && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=200201 --to=200209 && \
echo "=== 단계 4/4c: 조기 (200605) ===" && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=200605 --to=200605 && \
echo "=== 전체 PreparPc 체인 완료 ==="

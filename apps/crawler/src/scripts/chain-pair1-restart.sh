#!/bin/bash
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
echo "=== Pair1 재시작 (G1: 201202~201412 → G2: 201501~201712) ==="
pnpm ts-node src/bulk-opening-preparpc.ts --from=201202 --to=201412 && \
pnpm ts-node src/bulk-opening-preparpc.ts --from=201501 --to=201712
echo "=== Pair1 완료 ==="

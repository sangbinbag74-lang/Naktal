#!/bin/bash
# reparse 완료 대기 → 2016-12 단독 재시도 → audit
T="C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks"
echo "[chain-audit-v2] reparse 완료 대기..."
while true; do
  if grep -q "Announcement reparse 완료" "$T/bmtx8zn3x.output" 2>/dev/null; then break; fi
  sleep 120
done

echo "[chain-audit-v2] === reparse 완료 — 2016-12 재시도 (deadlock 회피) ==="
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
pnpm ts-node src/bulk-import-extras-v2.ts --from=201612 --to=201612 || echo "[chain-audit-v2] 2016-12 재시도 실패 (계속 진행)"

echo "[chain-audit-v2] === 최종 감사 시작 ==="
pnpm ts-node src/scripts/audit-data-quality.ts > /tmp/audit-result.log 2>&1
cat /tmp/audit-result.log
echo "[chain-audit-v2] === 감사 완료 ==="

deficient=$(grep -E "✗|⚠️" /tmp/audit-result.log | head -10)
if [ -n "$deficient" ]; then
  echo "[chain-audit-v2] 🔴 부족 필드 발견 (사용자 결정 필요):"
  echo "$deficient"
else
  echo "[chain-audit-v2] ✅ 모든 필드 95%+ 통과"
fi

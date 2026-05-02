#!/bin/bash
T="C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks"
echo "[chain-audit] chain-final (bmtx8zn3x) + 2016-12 (byu36txv1) 완료 대기..."

# bmtx8zn3x: "Announcement reparse 완료" 출력 시까지
# byu36txv1: "=== v2 완료" 출력 시까지
while true; do
  ok_main=$(grep -c "Announcement reparse 완료" "$T/bmtx8zn3x.output" 2>/dev/null | head -1 | tr -d '\n')
  ok_2016=$(grep -c "=== v2 완료" "$T/byu36txv1.output" 2>/dev/null | head -1 | tr -d '\n')
  ok_main=${ok_main:-0}
  ok_2016=${ok_2016:-0}
  if [ "$ok_main" -ge 1 ] && [ "$ok_2016" -ge 1 ]; then break; fi
  sleep 120
done

echo "[chain-audit] === 모든 작업 완료 — 최종 감사 시작 ==="
cd "/c/01 Ai/23 Naktal/naktal/apps/crawler"
pnpm ts-node src/scripts/audit-data-quality.ts > /tmp/audit-result.log 2>&1
cat /tmp/audit-result.log

echo "[chain-audit] === 감사 완료 ==="

# 부족 필드 자동 식별 (95% 미달)
deficient=$(grep -E "✗|⚠️" /tmp/audit-result.log | head -10)
if [ -n "$deficient" ]; then
  echo "[chain-audit] 🔴 부족 필드 발견 (사용자 결정 필요):"
  echo "$deficient"
else
  echo "[chain-audit] ✅ 모든 필드 95%+ 통과"
fi

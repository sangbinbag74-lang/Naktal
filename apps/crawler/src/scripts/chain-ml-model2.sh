#!/bin/bash
T="C:/Users/psp00/AppData/Local/Temp/claude/c--01-Ai-23-Naktal/7aa507d8-bc34-4c57-ad9f-107da32bfab0/tasks"
echo "[ml-chain] === 1/4 export 완료 대기 ==="
while true; do
  if grep -qE "추출 완료|export 완료|=== 완료" "$T/bp5egozd4.output" 2>/dev/null; then break; fi
  sleep 60
done
echo "[ml-chain] === 1/4 ✅ export 완료 ==="

echo "[ml-chain] === 2/4 Python 학습 (train_opening.py) 시작 ==="
cd "/c/01 Ai/23 Naktal/naktal/apps/ml"
python pipelines/train_opening.py 2>&1
TRAIN_EXIT=$?
echo "[ml-chain] === 2/4 train exit=$TRAIN_EXIT ==="

if [ $TRAIN_EXIT -ne 0 ]; then
  echo "[ml-chain] ❌ Python 학습 실패 — 중단"
  exit 1
fi

echo "[ml-chain] === 3/4 ONNX 변환 ==="
if [ -f pipelines/convert_onnx.py ]; then
  python pipelines/convert_onnx.py opening 2>&1
elif [ -f convert_onnx.py ]; then
  python convert_onnx.py opening 2>&1
else
  echo "[ml-chain] ⚠️ convert_onnx.py 없음 — 사용자가 작성 필요"
fi
echo "[ml-chain] === 3/4 ONNX 변환 완료 ==="

echo "[ml-chain] === 4/4 배포 단계 — 사용자 작업 필요 (opening-engine.ts + API route) ==="

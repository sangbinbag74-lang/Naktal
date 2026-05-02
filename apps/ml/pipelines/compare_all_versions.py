"""
v1~v8 Top-4 Precision 종합 비교 + 결론

지금까지 결과 (수동 입력):
  v1 LGBM (배포)               : val ~0.326 / test ~0.326
  v2 + target encoding         : val 0.326  / test ~
  v3 LGBM smoothed TE          : val 0.3261 / test 0.3260
  v4 oracle hierarchical (cheat): train 0.3418 / val 0.3203 / test 0.3207
  v5 + KoBERT 64d              : val 0.3261 / test 0.3260
  v6 CatBoost + KoBERT         : (실행 중)
  v7 KNN (KoBERT cosine)       : (실행 중)
  v8 recent-only TE            : (대기)

이론 천장:
  - global freq baseline (train→val) : 0.3261
  - val self-freq oracle              : 0.3261
  - val (org,cat) self-oracle        : 0.3491
  - val 발주처 self-oracle (in-sample): 0.3443

결론 가능성:
  A. 모든 모델 0.326 -> 데이터 ML 한계 = 0.326
  B. 일부 모델 > 0.326 -> 학습 가능 신호 발견, 선택 모델 배포
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

print("=" * 76)
print("Model 2 (복수예가 번호 선택) — 모든 버전 결과 종합")
print("=" * 76)
print()
print(f"{'버전':<35} {'val Top-4':>11} {'test Top-4':>12}  {'비고':<15}")
print("-" * 76)
results = [
    ("v1 LGBM (배포 ONNX)",                "~0.326",   "~0.326",  "최초"),
    ("v2 + target encoding",                "~0.326",   "-",       ""),
    ("v3 LGBM smoothed TE",                 "0.3261",   "0.3260",  "alpha=0 best"),
    ("v4 oracle hierarchical (cheat)",      "0.3203",   "0.3207",  "drift진단"),
    ("v5 + KoBERT 64d",                     "0.3261",   "0.3260",  "KoBERT 0효과"),
    ("v6 CatBoost + KoBERT",                "0.3261",   "0.3260",  "ML단독 0.279"),
    ("v7 KNN cosine (KoBERT)",              "0.3261",   "0.3260",  "KNN단독 0.310"),
    ("v8 recent-only TE (2022-23)",         "0.3261",   "0.3260",  "drift없음 확인"),
    ("", "", "", ""),
    ("baseline 1: train→val 글로벌 freq",   "0.3261",   "0.3260",  "= 모든 ML"),
    ("baseline 2: val self-freq oracle",    "0.3261",   "0.3260",  ""),
    ("baseline 3: val (org,cat) self-oracle (이론)", "0.3491", "0.3476",  "도달불가"),
    ("baseline 4: 발주처 self-oracle in-sample", "0.3443", "-",     ""),
    ("baseline 5: random uniform Top-4",    "0.2667",   "0.2667",  ""),
]
for r in results:
    name = r[0][:35]
    print(f"{name:<35} {r[1]:>11} {r[2]:>12}  {r[3]:<15}")

print()
print("=" * 76)
print("결론 가이드")
print("=" * 76)
print("""
* 천장 인정 (모든 모델 ≤ 0.328)
  - 데이터 본질 한계가 freq baseline 0.326
  - frequency-engine.ts 단순화 배포

* 천장 돌파 발견 (어떤 모델 > 0.330)
  - 그 모델 선택 + ONNX 변환 + 배포

* (org,cat) oracle 0.349 vs train→val 전이 = 0.32 gap의 원인
  -> 시간 invariant transfer 본질적 어려움
""")

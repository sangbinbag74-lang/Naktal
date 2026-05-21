"""박상빈님 5/21 — E 옵션 타당성 실측 검증.

검증 항목:
  1. lambda vs 벡터화 처리 시간 (실측)
  2. 카테고리 인코딩 결과 동일성 (row-by-row 비교)
  3. predict 결과 동일성 (numerical equivalence)
  4. unknown 카테고리 처리 (학습 데이터 외 값)
"""
import sys, io, time
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from pathlib import Path
import numpy as np
import pandas as pd
import joblib

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
DATA_PATH = ROOT / "data" / "training_data_v2.csv"

print("=" * 80)
print("E 옵션 타당성 실측 검증 (박상빈님 5/21)")
print("=" * 80)

# 1. 모델 + encoders 로드
print("\n[1] sajung_quantile_q50_new.pkl 로드…")
payload = joblib.load(MODEL_DIR / "sajung_quantile_q50_new.pkl")
encoders = payload["encoders"]
categorical = payload["categorical_cols"]
features = payload["feature_names"]
model = payload["model"]
print(f"  categorical: {categorical}")
print(f"  features 총 {len(features)}개")

# 2. 데이터 로드 (10K 샘플 = 빠른 검증)
print(f"\n[2] {DATA_PATH.name} 10K 샘플 로드…")
df = pd.read_csv(DATA_PATH, nrows=10000, dtype={
    "category": "string", "orgName": "string",
    "budgetRange": "string", "region": "string",
    "subcat_main": "string",
})
print(f"  샘플 {len(df):,}건")

# 3. 현재 코드 (lambda map) — predict_lgbm_one L51-58 동일
def encode_lambda(df_in):
    out = df_in.copy()
    for col in categorical:
        if col in encoders:
            le = encoders[col]
            out[col] = out[col].fillna("").astype(str).map(
                lambda v: le.transform([v])[0] if v in le.classes_ else 0
            )
        else:
            out[col] = 0
    return out

# 4. E 옵션 (numpy 벡터화)
def encode_vectorized(df_in):
    out = df_in.copy()
    for col in categorical:
        if col in encoders:
            le = encoders[col]
            vals = out[col].fillna("").astype(str).values
            known_mask = np.isin(vals, le.classes_)
            result = np.zeros(len(vals), dtype=np.int64)
            if known_mask.any():
                result[known_mask] = le.transform(vals[known_mask])
            out[col] = result
        else:
            out[col] = 0
    return out

# 5. 시간 측정
print("\n[3] 시간 측정 (lambda vs 벡터화)…")
t0 = time.time()
df_a = encode_lambda(df)
t_lambda = time.time() - t0
print(f"  lambda map: {t_lambda:.3f}s")

t0 = time.time()
df_b = encode_vectorized(df)
t_vec = time.time() - t0
print(f"  벡터화:    {t_vec:.3f}s")
print(f"  가속비:    {t_lambda/max(t_vec,0.001):.1f}배")

# 산수: 145K 추정
print(f"  [산수] 145K 환산 lambda: {t_lambda * 14.5969:.1f}s/모델 × 16 = {t_lambda * 14.5969 * 16:.1f}s")
print(f"  [산수] 145K 환산 벡터화: {t_vec * 14.5969:.1f}s/모델 × 16 = {t_vec * 14.5969 * 16:.1f}s")

# 6. 카테고리 인코딩 결과 동일성 검증
print("\n[4] 카테고리 row-by-row 동일성 검증…")
all_ok = True
for col in categorical:
    if col in encoders:
        diff = (df_a[col].values != df_b[col].values).sum()
        status = "✓ 동일" if diff == 0 else "❌ 불일치"
        print(f"  {col}: {diff}건 차이 / {len(df_a)}건 {status}")
        if diff > 0:
            all_ok = False
            # 차이 첫 5개
            mask = df_a[col].values != df_b[col].values
            idx = np.where(mask)[0][:5]
            for i in idx:
                v = df[col].iloc[i]
                in_classes = v in encoders[col].classes_ if pd.notna(v) else False
                print(f"    idx {i}: 원본='{v}' lambda={df_a[col].iloc[i]} vec={df_b[col].iloc[i]} in_classes={in_classes}")

# 7. predict 결과 동일성 검증
print("\n[5] LightGBM predict 결과 동일성 검증…")
for f in features:
    if f not in df_a.columns: df_a[f] = 0
    if f not in df_b.columns: df_b[f] = 0
X_a = df_a[features].fillna(0).values
X_b = df_b[features].fillna(0).values
pred_a = model.predict(X_a, num_iteration=model.best_iteration)
pred_b = model.predict(X_b, num_iteration=model.best_iteration)
diff_mean = np.abs(pred_a - pred_b).mean()
diff_max = np.abs(pred_a - pred_b).max()
status_p = "✓ 동일 (정확도 영향 0)" if diff_max < 1e-9 else f"❌ 불일치 (max={diff_max})"
print(f"  predict 평균 차이: {diff_mean:.10f}")
print(f"  predict 최대 차이: {diff_max:.10f}")
print(f"  결과: {status_p}")

# 8. unknown 카테고리 추가 검증
print("\n[6] unknown 카테고리 처리 검증 (학습 데이터 외 값 인위 주입)…")
df_unk = df.head(100).copy()
df_unk["category"] = "이건학습데이터에없는카테고리"
a = encode_lambda(df_unk)
b = encode_vectorized(df_unk)
cat_a = a["category"].values
cat_b = b["category"].values
diff_unk = (cat_a != cat_b).sum()
all_zero_a = (cat_a == 0).all()
all_zero_b = (cat_b == 0).all()
print(f"  lambda 결과: 모두 0 = {all_zero_a}")
print(f"  벡터화 결과: 모두 0 = {all_zero_b}")
print(f"  차이: {diff_unk}건 / {len(df_unk)}건")

# 9. 최종 판정
print("\n" + "=" * 80)
print("최종 판정")
print("=" * 80)
print(f"  카테고리 동일성:       {'✓ 통과' if all_ok else '❌ 실패'}")
print(f"  predict 동일성:        {'✓ 통과 (정확도 영향 0)' if diff_max < 1e-9 else '❌ 실패'}")
print(f"  unknown 처리:          {'✓ 통과' if diff_unk == 0 else '❌ 실패'}")
print(f"  가속비:                {t_lambda/max(t_vec,0.001):.1f}배")
print(f"  E 옵션 타당성:         {'✓ 박상빈님 메모리 H 부합 (정확도 영향 0)' if (all_ok and diff_max < 1e-9 and diff_unk == 0) else '❌ 부적합'}")

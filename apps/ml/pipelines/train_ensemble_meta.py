"""
사정율 추천 시스템 — Phase 4 Ensemble (방법 6)

구조:
       [공고 특성]
            │
    ┌───────┼───────┐
    ↓       ↓       ↓
  사정율   하한가   1순위
  Q[5,50,95] 회귀   Q[5,50,95]
    │       │       │
    └───────┼───────┘
            ↓
   메타 학습 (XGBoost stacking)
            ↓
       최종 추천가 (q95 = 적격 95% 보장)

입력: Phase 2 + Phase 3 모델 + training_data_v2.csv + training_data_lowerlimit.csv
출력: apps/ml/models/ensemble_meta_q95.pkl
      apps/ml/models/ensemble_meta_q50.pkl

라벨: 1순위 투찰률 (q95 보다 적격 통과 직결)
      추후 → 다른 quantile 도 학습 가능

알고리즘:
  - Level 1: Phase 2 (사정율 분포) + Phase 3 (1순위 위치) — out-of-fold prediction
  - Level 2: XGBoost meta — 6개 입력 + 원본 피처 일부 → 최종 1순위 quantile

실행:
    cd apps/ml
    python pipelines/train_sajung_quantile.py        # Phase 2 학습
    # export-training-data-lowerlimit.ts 실행 후
    python pipelines/train_lowerlimit_direct.py      # Phase 3 학습
    python pipelines/train_ensemble_meta.py          # Phase 4 학습 (본 스크립트)
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import LabelEncoder

try:
    import xgboost as xgb
except ImportError:
    print("xgboost 미설치 — pip install xgboost")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
DATA_PATH = ROOT / "data" / "training_data_lowerlimit.csv"   # 1순위 라벨 데이터

# Phase 2/3 모델 로드
SAJUNG_Q05 = MODEL_DIR / "sajung_quantile_q05.pkl"
SAJUNG_Q50 = MODEL_DIR / "sajung_quantile_q50.pkl"
SAJUNG_Q95 = MODEL_DIR / "sajung_quantile_q95.pkl"
LWLT_Q05   = MODEL_DIR / "lowerlimit_q05.pkl"
LWLT_Q50   = MODEL_DIR / "lowerlimit_q50.pkl"
LWLT_Q95   = MODEL_DIR / "lowerlimit_q95.pkl"


def check_models():
    missing = [p for p in [SAJUNG_Q05, SAJUNG_Q50, SAJUNG_Q95, LWLT_Q05, LWLT_Q50, LWLT_Q95] if not p.exists()]
    if missing:
        print("필요한 모델 누락:")
        for p in missing:
            print(f"  - {p}")
        print("\n순서대로 학습하세요:")
        print("  1. python pipelines/train_sajung_quantile.py")
        print("  2. (apps/crawler) ts-node src/scripts/export-training-data-lowerlimit.ts")
        print("  3. python pipelines/train_lowerlimit_direct.py")
        sys.exit(1)


def predict_with_pkl(pkl_path, df_features, common_feature_cols):
    bundle = joblib.load(pkl_path)
    model = bundle["model"]
    feat_names = bundle["feature_names"]
    cat_cols = bundle["categorical_cols"]
    encoders = bundle["encoders"]

    # 피처 재구성
    X = df_features.copy()
    for col in cat_cols:
        le: LabelEncoder = encoders[col]
        # 미지 카테고리 → 0 (LabelEncoder 첫번째 값)
        known = set(le.classes_)
        X[col] = X[col].astype(str).fillna("").apply(lambda v: v if v in known else le.classes_[0])
        X[col] = le.transform(X[col])

    # feat_names 순서대로 선택, 누락 컬럼은 0
    for c in feat_names:
        if c not in X.columns:
            X[c] = 0
    X = X[feat_names]
    return model.predict(X, num_iteration=getattr(model, "best_iteration", None))


def main():
    check_models()
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음.")
        sys.exit(1)

    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
    })
    print(f"학습 데이터: {len(df):,}건")

    # 레벨 1 예측 — 6개 모델 출력
    print("\n[Level 1] Phase 2 + Phase 3 예측 생성...")
    df["pred_sajung_q05"] = predict_with_pkl(SAJUNG_Q05, df, None)
    df["pred_sajung_q50"] = predict_with_pkl(SAJUNG_Q50, df, None)
    df["pred_sajung_q95"] = predict_with_pkl(SAJUNG_Q95, df, None)
    df["pred_lwlt_q05"]   = predict_with_pkl(LWLT_Q05,   df, None)
    df["pred_lwlt_q50"]   = predict_with_pkl(LWLT_Q50,   df, None)
    df["pred_lwlt_q95"]   = predict_with_pkl(LWLT_Q95,   df, None)
    print("  완료")

    # 레벨 2 메타 학습 — XGBoost quantile loss
    META_FEATURES = [
        "pred_sajung_q05", "pred_sajung_q50", "pred_sajung_q95",
        "pred_lwlt_q05", "pred_lwlt_q50", "pred_lwlt_q95",
        # 원본 피처 일부 (메타 학습에 도움)
        "budget_log", "lwltRate", "stat_stddev", "sampleSize", "numBidders",
    ]
    TARGET = "winrate"  # 1순위 투찰률

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()

    X_train = df_train[META_FEATURES].fillna(0)
    y_train = df_train[TARGET].astype(float)
    X_val   = df_val[META_FEATURES].fillna(0)
    y_val   = df_val[TARGET].astype(float)
    X_test  = df_test[META_FEATURES].fillna(0)
    y_test  = df_test[TARGET].astype(float)

    print(f"\nMeta 학습 — train {len(X_train):,} / val {len(X_val):,} / test {len(X_test):,}")

    final_models = {}
    for alpha, suffix in [(0.50, "q50"), (0.95, "q95")]:
        print(f"\n[Meta α={alpha}] 학습...")
        params = dict(
            objective="reg:quantileerror",
            quantile_alpha=alpha,
            learning_rate=0.03,
            max_depth=6,
            min_child_weight=10,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=0.1,
            tree_method="hist",
        )
        dtrain = xgb.DMatrix(X_train, label=y_train)
        dval   = xgb.DMatrix(X_val,   label=y_val)
        dtest  = xgb.DMatrix(X_test,  label=y_test)

        model = xgb.train(
            params, dtrain,
            num_boost_round=2000,
            evals=[(dtrain, "train"), (dval, "val")],
            early_stopping_rounds=150,
            verbose_eval=100,
        )

        pred_test = model.predict(dtest)
        diff = y_test - pred_test
        pinball = np.where(diff >= 0, alpha * diff, (alpha - 1) * diff).mean()
        print(f"  test pinball loss = {pinball:.4f}")

        if alpha == 0.95:
            breach = (y_test > pred_test).mean()
            print(f"  안전선 검증: y > q95 = {breach:.3f} (이상 ≤ 0.05)")

        out = MODEL_DIR / f"ensemble_meta_{suffix}.pkl"
        joblib.dump({
            "model": model,
            "feature_names": META_FEATURES,
            "alpha": alpha,
            "model_version": f"ensemble-meta-v1.0-{suffix}",
            "phase2_models": ["sajung_quantile_q05", "sajung_quantile_q50", "sajung_quantile_q95"],
            "phase3_models": ["lowerlimit_q05", "lowerlimit_q50", "lowerlimit_q95"],
        }, out)
        print(f"  저장: {out}")
        final_models[alpha] = model

    print("\n[Phase 4 Ensemble 완료] 모든 모델 학습 완료.")
    print("다음 단계: ONNX 변환 → Next.js 배포")


if __name__ == "__main__":
    main()

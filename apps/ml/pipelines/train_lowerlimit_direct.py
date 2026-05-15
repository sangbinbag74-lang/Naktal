"""
낙찰하한가 직접 학습 — Phase 3 재설계

기존: 사정율 예측 → × 낙찰하한율 → 추천가 (2단계 곱, 오차 누적)
신규: 낙찰하한가/기초금액 비율 (= 1순위 투찰률) 직접 예측 (1단계)

라벨: BidResult.bidRate (1위 투찰률) — 이미 DB에 있음
  → 1위는 항상 낙찰하한가 바로 위 → bidRate ≈ 낙찰하한가 / 기초금액

알고리즘: LightGBM quantile (q05/q50/q95) — Phase 2와 동일 구조
효과: 사정율 변환 단계 제거 → MAE 추가 개선 가능 (0.40 → 0.30%대 목표)

입력: apps/ml/data/training_data_lowerlimit.csv (export-training-data-lowerlimit.ts 필요)
출력: apps/ml/models/lowerlimit_q05.pkl / q50 / q95

실행:
    cd apps/ml
    python pipelines/train_lowerlimit_direct.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import LabelEncoder
import joblib

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "training_data_lowerlimit.csv"
MODEL_DIR = ROOT / "models"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "month", "year", "weekday", "season_q",
    "budget_log", "numBidders",
    "stat_avg", "stat_stddev", "sampleSize",
    "aValueTotal_log", "aValue_ratio", "has_avalue",
    "bsisAmt_log", "bsis_to_budget",
    "lwltRate",
    # Expanding mean 6개 (Leakage-free)
    "org_past_winrate_mean", "org_past_winrate_std", "org_past_winrate_cnt",
    "cat_past_winrate_mean", "cat_past_winrate_std", "cat_past_winrate_cnt",
]
TARGET_COL = "winrate"  # 1위 투찰률 = BidResult.bidRate (낙찰하한가 비율 근사)

QUANTILES = [0.05, 0.50, 0.95]


def encode_categoricals(df_train, df_val, df_test):
    encoders = {}
    for col in CATEGORICAL_COLS:
        le = LabelEncoder()
        all_values = pd.concat([df_train[col], df_val[col], df_test[col]]).astype(str).fillna("")
        le.fit(all_values)
        df_train[col] = le.transform(df_train[col].astype(str).fillna(""))
        df_val[col]   = le.transform(df_val[col].astype(str).fillna(""))
        df_test[col]  = le.transform(df_test[col].astype(str).fillna(""))
        encoders[col] = le
    return df_train, df_val, df_test, encoders


def train_one(alpha, X_train, y_train, X_val, y_val):
    params = dict(
        objective="quantile",
        alpha=alpha,
        metric="quantile",
        num_leaves=127,
        learning_rate=0.03,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=30,
        lambda_l1=0.1,
        lambda_l2=0.1,
        verbose=-1,
    )
    train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS)
    val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=CATEGORICAL_COLS, reference=train_set)
    print(f"\n[Lowerlimit α={alpha}] 학습...")
    return lgb.train(
        params, train_set,
        num_boost_round=3000,
        valid_sets=[train_set, val_set],
        valid_names=["train", "val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=150),
            lgb.log_evaluation(period=100),
        ],
    )


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음.")
        print("apps/crawler/src/scripts/export-training-data-lowerlimit.ts 먼저 실행하세요.")
        sys.exit(1)

    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
    })
    print(f"전체: {len(df):,}건")

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)
    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS

    X_train, y_train = df_train[feature_cols], df_train[TARGET_COL].astype(float)
    X_val,   y_val   = df_val[feature_cols],   df_val[TARGET_COL].astype(float)
    X_test,  y_test  = df_test[feature_cols],  df_test[TARGET_COL].astype(float)

    models = {}
    for alpha in QUANTILES:
        m = train_one(alpha, X_train, y_train, X_val, y_val)
        models[alpha] = m
        pred = m.predict(X_test, num_iteration=m.best_iteration)
        diff = y_test - pred
        pinball = np.where(diff >= 0, alpha * diff, (alpha - 1) * diff).mean()
        print(f"  test pinball = {pinball:.4f}")

    # 적격 통과 안전선 검증
    p95 = models[0.95].predict(X_test, num_iteration=models[0.95].best_iteration)
    breach = (y_test > p95).mean()
    print(f"\n안전선 검증: y > q95 = {breach:.3f} (이상 ≤ 0.05)")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for alpha in QUANTILES:
        suffix = f"q{int(alpha*100):02d}"
        path = MODEL_DIR / f"lowerlimit_{suffix}.pkl"
        joblib.dump({
            "model": models[alpha],
            "encoders": encoders,
            "feature_names": feature_cols,
            "categorical_cols": CATEGORICAL_COLS,
            "numeric_cols": NUMERIC_COLS,
            "alpha": alpha,
            "model_version": f"lowerlimit-quantile-v1.0-{suffix}",
        }, path)
        print(f"  저장: {path}")


if __name__ == "__main__":
    main()

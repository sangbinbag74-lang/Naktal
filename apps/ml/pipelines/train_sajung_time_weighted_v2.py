"""박상빈님 5/20 #6 v2 — 시간 가중 재학습 (수정).

이전 #6 = train 70% 모두 옛 데이터 = 가중 효과 X.
이번 #6 v2 = train 의 deadline 기준 마지막 50% = sample_weight 2.0x.
(train 자체에서 시간 가중)

학습 시간 = 약 30분.
"""
import sys, io, time
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import LabelEncoder
import joblib

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "training_data_v2.csv"
MODEL_DIR = ROOT / "models"

CATEGORICAL_COLS = ["category", "orgName", "budgetRange", "region", "subcat_main"]
NUMERIC_COLS = [
    "month", "year", "weekday", "is_quarter_end", "is_year_end", "season_q",
    "budget_log", "numBidders",
    "stat_avg", "stat_stddev", "stat_p25", "stat_p75", "sampleSize",
    "bidder_volatility", "is_sparse_org",
    "aValueTotal_log", "aValue_ratio", "has_avalue",
    "bsisAmt_log", "bsis_to_budget",
    "lwltRate", "rsrvtn_bgn", "rsrvtn_end",
    "has_prestdrd", "chg_count",
    "org_past_mean", "org_past_std", "org_past_cnt",
    "cat_past_mean", "cat_past_std", "cat_past_cnt",
    "reg_past_mean", "reg_past_std", "reg_past_cnt",
    "bud_past_mean", "bud_past_std", "bud_past_cnt",
    "sub_past_mean", "sub_past_std", "sub_past_cnt",
    "orgcat_past_mean", "orgcat_past_std", "orgcat_past_cnt",
    "catreg_past_mean", "catreg_past_std", "catreg_past_cnt",
    "orgbud_past_mean", "orgbud_past_std", "orgbud_past_cnt",
]
TARGET_COL = "sajung_rate"


def main():
    print(f"[{time.strftime('%H:%M:%S')}] 데이터 로드…", flush=True)
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string", "subcat_main": "string",
    }, low_memory=False)
    df = df.sort_values("deadline").reset_index(drop=True)
    n = len(df)
    train_end = int(n * 0.7)
    val_end = int(n * 0.85)
    df_train = df.iloc[:train_end].copy()
    df_val = df.iloc[train_end:val_end].copy()
    df_test = df.iloc[val_end:].copy()

    # 시간 가중: train 의 마지막 50% = 2.0x
    recent_start = int(len(df_train) * 0.5)
    weights = np.ones(len(df_train))
    weights[recent_start:] = 2.0
    print(f"  train 마지막 50% = 2.0x ({len(df_train) - recent_start:,}건)")

    encoders = {}
    for col in CATEGORICAL_COLS:
        le = LabelEncoder()
        all_values = pd.concat([df_train[col], df_val[col], df_test[col]]).astype(str).fillna("")
        le.fit(all_values)
        df_train[col] = le.transform(df_train[col].astype(str).fillna(""))
        df_val[col] = le.transform(df_val[col].astype(str).fillna(""))
        df_test[col] = le.transform(df_test[col].astype(str).fillna(""))
        encoders[col] = le

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS
    X_train = df_train[feature_cols].fillna(0).values
    y_train = df_train[TARGET_COL].values
    X_val = df_val[feature_cols].fillna(0).values
    y_val = df_val[TARGET_COL].values
    X_test = df_test[feature_cols].fillna(0).values
    y_test = df_test[TARGET_COL].values

    cat_idx = list(range(len(CATEGORICAL_COLS)))
    train_set = lgb.Dataset(X_train, y_train, weight=weights, categorical_feature=cat_idx)
    val_set = lgb.Dataset(X_val, y_val, categorical_feature=cat_idx, reference=train_set)

    params = dict(
        objective="quantile", alpha=0.7, metric="quantile",
        num_leaves=127, learning_rate=0.03,
        feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=5,
        min_data_in_leaf=30, lambda_l1=0.1, lambda_l2=0.1, verbose=-1,
    )
    print(f"\n[{time.strftime('%H:%M:%S')}] 시간 가중 v2 학습 시작…", flush=True)
    model = lgb.train(params, train_set, num_boost_round=2000,
                      valid_sets=[val_set], valid_names=["val"],
                      callbacks=[lgb.early_stopping(100, verbose=False)])

    out = MODEL_DIR / "sajung_quantile_q70_timewt_v2.pkl"
    joblib.dump({
        "model": model, "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS, "numeric_cols": NUMERIC_COLS,
        "encoders": encoders, "alpha": 0.7,
        "model_version": "sajung-quantile-q70-timewt-v2-2026-05-20",
    }, out)

    pred = model.predict(X_test, num_iteration=model.best_iteration)
    dev = np.abs(pred - y_test)
    top1 = (dev <= 0.05).mean() * 100
    disq = (pred < y_test).mean() * 100
    score = top1 - disq * 0.05
    print(f"\n=== #6 v2 시간 가중 q70 test ===")
    print(f"  부적격: {disq:.2f}% / 1위: {top1:.2f}% / 점수: {score:.3f}")
    print(f"  best iter: {model.best_iteration}")
    print(f"  저장: {out.name}")


if __name__ == "__main__":
    main()

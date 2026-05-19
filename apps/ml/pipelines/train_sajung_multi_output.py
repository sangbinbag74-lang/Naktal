"""박상빈님 5/19 #9 — Multi-output ML (사정율 + 박스권 + 1위 확률 동시 예측).

3개 출력:
  1. sajung_rate (regression, q70)
  2. is_in_box (binary: y in [q40, q60])
  3. is_top1 (binary: |pred - y| <= 0.05)

알고리즘: LightGBM 3개 별도 학습 (multi-output 결합).
산수상 약 30분~1시간.
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


def main():
    print(f"[{time.strftime('%H:%M:%S')}] 데이터 로드…", flush=True)
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string", "subcat_main": "string",
    }, low_memory=False)
    df = df.sort_values("deadline").reset_index(drop=True)
    n = len(df)
    train_end = int(n * 0.7)
    val_end   = int(n * 0.85)
    df_train = df.iloc[:train_end].copy()
    df_val   = df.iloc[train_end:val_end].copy()
    df_test  = df.iloc[val_end:].copy()

    encoders = {}
    for col in CATEGORICAL_COLS:
        le = LabelEncoder()
        all_values = pd.concat([df_train[col], df_val[col], df_test[col]]).astype(str).fillna("")
        le.fit(all_values)
        df_train[col] = le.transform(df_train[col].astype(str).fillna(""))
        df_val[col]   = le.transform(df_val[col].astype(str).fillna(""))
        df_test[col]  = le.transform(df_test[col].astype(str).fillna(""))
        encoders[col] = le

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS
    X_train = df_train[feature_cols].fillna(0).values
    X_val   = df_val[feature_cols].fillna(0).values
    X_test  = df_test[feature_cols].fillna(0).values

    y_train = df_train["sajung_rate"].values
    y_val   = df_val["sajung_rate"].values
    y_test  = df_test["sajung_rate"].values

    cat_idx = list(range(len(CATEGORICAL_COLS)))

    # Output 1: 사정율 q70 (regression)
    print(f"\n[{time.strftime('%H:%M:%S')}] Output 1: 사정율 q70 학습…", flush=True)
    params_q = dict(
        objective="quantile", alpha=0.7, metric="quantile",
        num_leaves=127, learning_rate=0.03,
        feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=5,
        min_data_in_leaf=30, lambda_l1=0.1, lambda_l2=0.1, verbose=-1,
    )
    train_set_q = lgb.Dataset(X_train, y_train, categorical_feature=cat_idx)
    val_set_q   = lgb.Dataset(X_val, y_val, categorical_feature=cat_idx, reference=train_set_q)
    model_q = lgb.train(params_q, train_set_q, num_boost_round=2000,
                         valid_sets=[val_set_q], valid_names=["val"],
                         callbacks=[lgb.early_stopping(100, verbose=False)])

    # Output 2: is_in_box (binary, val ⊂ [q40_pred, q60_pred]) — proxy: y in [99.5, 100.3] (대략 q40-q60)
    print(f"\n[{time.strftime('%H:%M:%S')}] Output 2: is_in_mid_box 학습…", flush=True)
    # 박스권 중심 = q40-q60 = 사정율 99.694~100.050
    in_mid_train = ((y_train >= 99.6) & (y_train <= 100.1)).astype(int)
    in_mid_val   = ((y_val   >= 99.6) & (y_val   <= 100.1)).astype(int)
    in_mid_test  = ((y_test  >= 99.6) & (y_test  <= 100.1)).astype(int)
    params_b = dict(
        objective="binary", metric="binary_logloss",
        num_leaves=127, learning_rate=0.03,
        feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=5,
        min_data_in_leaf=30, lambda_l1=0.1, lambda_l2=0.1, verbose=-1,
    )
    train_set_b = lgb.Dataset(X_train, in_mid_train, categorical_feature=cat_idx)
    val_set_b   = lgb.Dataset(X_val, in_mid_val, categorical_feature=cat_idx, reference=train_set_b)
    model_b = lgb.train(params_b, train_set_b, num_boost_round=2000,
                         valid_sets=[val_set_b], valid_names=["val"],
                         callbacks=[lgb.early_stopping(100, verbose=False)])

    # Output 3: 1위 확률 (binary, |y - mean| < 0.05) — mean of category
    print(f"\n[{time.strftime('%H:%M:%S')}] Output 3: is_top1 학습…", flush=True)
    # train 데이터에서 카테고리별 mean 계산 → 그 mean ± 0.05 안이면 top1=1
    cat_mean = df_train.groupby("category")["sajung_rate"].mean()
    # 단순화: 사정율이 99.85~99.95 (전체 분포 mean ± 0.05) 안이면 1
    overall_mean = y_train.mean()
    top1_train = (np.abs(y_train - overall_mean) <= 0.05).astype(int)
    top1_val   = (np.abs(y_val   - overall_mean) <= 0.05).astype(int)
    top1_test  = (np.abs(y_test  - overall_mean) <= 0.05).astype(int)
    train_set_t = lgb.Dataset(X_train, top1_train, categorical_feature=cat_idx)
    val_set_t   = lgb.Dataset(X_val, top1_val, categorical_feature=cat_idx, reference=train_set_t)
    model_t = lgb.train(params_b, train_set_t, num_boost_round=2000,
                         valid_sets=[val_set_t], valid_names=["val"],
                         callbacks=[lgb.early_stopping(100, verbose=False)])

    # Test 평가
    pred_q = model_q.predict(X_test, num_iteration=model_q.best_iteration)
    pred_b = model_b.predict(X_test, num_iteration=model_b.best_iteration)
    pred_t = model_t.predict(X_test, num_iteration=model_t.best_iteration)

    # 결합: q70 추론 + 박스권 안 가중 조정 + 1위 확률 가중
    # 단순화: 단독 q70 + 보정
    recommended = pred_q + (pred_b - 0.5) * 0.1 + (pred_t - 0.5) * 0.1
    dev = np.abs(recommended - y_test)
    top1_005 = (dev <= 0.05).mean() * 100
    disq = (recommended < y_test).mean() * 100
    score = top1_005 - disq * 0.05
    print(f"\n=== #9 multi-output test 평가 ===")
    print(f"  부적격: {disq:.2f}% / 1위 ±0.05%p: {top1_005:.2f}% / 점수: {score:.3f}")

    # 단독 q70 비교
    dev_q = np.abs(pred_q - y_test)
    top1_q = (dev_q <= 0.05).mean() * 100
    disq_q = (pred_q < y_test).mean() * 100
    score_q = top1_q - disq_q * 0.05
    print(f"\n  (단독 q70: 부적격 {disq_q:.2f}% / 1위 {top1_q:.2f}% / 점수 {score_q:.3f})")

    # 저장
    out = MODEL_DIR / "sajung_multi_output.pkl"
    joblib.dump({
        "model_q": model_q, "model_box": model_b, "model_top1": model_t,
        "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS, "numeric_cols": NUMERIC_COLS,
        "encoders": encoders,
        "model_version": "sajung-multi-output-2026-05-19",
    }, out)
    print(f"\n  저장: {out.name}")


if __name__ == "__main__":
    main()

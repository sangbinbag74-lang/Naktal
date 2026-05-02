"""
사정율 v3 하이퍼파라미터 그리드 탐색.
v3 기본 0.4927 (Test MAE) → 더 낮출 수 있는지 체계적으로 시도.

탐색 축:
  - num_leaves: 63 / 127 / 255 / 511
  - learning_rate: 0.01 / 0.02 / 0.03
  - min_data_in_leaf: 10 / 30 / 60
  - feature_fraction: 0.7 / 0.8 / 0.9
  - lambda_l1: 0.0 / 0.1 / 0.5
조합 N=12 (대표 후보), val MAE 우선, 최저 모델 → sajung_lgbm_v3_tuned.pkl
"""
import sys
from pathlib import Path
import itertools
import time
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "training_data_v3.csv"
MODEL_DIR = ROOT / "models"
OUT_PATH = MODEL_DIR / "sajung_lgbm_v3_tuned.pkl"
LOG_PATH = ROOT / "data" / "tune_sajung_v3.log"

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
    "opened_month", "opened_weekday", "opened_hour",
    "opened_season_q", "days_deadline_to_open", "is_morning_open",
]
TARGET = "sajung_rate"


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


# 탐색 후보 (12조합, 핵심 변동축만 — 무한 그리드 회피)
CANDIDATES = [
    # baseline (v3와 동일)
    dict(num_leaves=127, learning_rate=0.03, min_data_in_leaf=30, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    # 더 작은 lr (수렴 정밀)
    dict(num_leaves=127, learning_rate=0.01, min_data_in_leaf=30, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    dict(num_leaves=127, learning_rate=0.02, min_data_in_leaf=30, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    # 더 깊은 트리
    dict(num_leaves=255, learning_rate=0.02, min_data_in_leaf=30, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    dict(num_leaves=511, learning_rate=0.02, min_data_in_leaf=30, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    # 작은 leaf (더 fine-grained)
    dict(num_leaves=255, learning_rate=0.02, min_data_in_leaf=10, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    dict(num_leaves=127, learning_rate=0.02, min_data_in_leaf=10, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    # 강한 regularization
    dict(num_leaves=127, learning_rate=0.02, min_data_in_leaf=60, feature_fraction=0.7, lambda_l1=0.5, lambda_l2=0.5),
    dict(num_leaves=255, learning_rate=0.02, min_data_in_leaf=60, feature_fraction=0.7, lambda_l1=0.5, lambda_l2=0.5),
    # feature_fraction 변동
    dict(num_leaves=127, learning_rate=0.02, min_data_in_leaf=30, feature_fraction=0.9, lambda_l1=0.1, lambda_l2=0.1),
    dict(num_leaves=255, learning_rate=0.01, min_data_in_leaf=30, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
    dict(num_leaves=63,  learning_rate=0.02, min_data_in_leaf=30, feature_fraction=0.8, lambda_l1=0.1, lambda_l2=0.1),
]


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음")
        sys.exit(1)

    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
    })
    print(f"전체: {len(df):,}건")

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()
    print(f"  train: {len(df_train):,}  val: {len(df_val):,}  test: {len(df_test):,}")

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)

    feat_cols = CATEGORICAL_COLS + NUMERIC_COLS
    X_train, y_train = df_train[feat_cols], df_train[TARGET].astype(float)
    X_val,   y_val   = df_val[feat_cols],   df_val[TARGET].astype(float)
    X_test,  y_test  = df_test[feat_cols],  df_test[TARGET].astype(float)

    results = []
    best = None
    log_lines = []

    for i, cfg in enumerate(CANDIDATES):
        t0 = time.time()
        params = dict(
            objective="regression_l1", metric="mae", verbose=-1,
            bagging_fraction=0.8, bagging_freq=5,
            feature_pre_filter=False,  # min_data_in_leaf 변경 가능하도록
        )
        params.update(cfg)
        print(f"\n=== [{i+1}/{len(CANDIDATES)}] {cfg} ===")
        # 매 후보마다 Dataset 재생성 (feature_pre_filter 캐시 회피)
        train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS,
                                 params={"feature_pre_filter": False})
        val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=CATEGORICAL_COLS,
                                 reference=train_set, params={"feature_pre_filter": False})
        model = lgb.train(
            params, train_set, num_boost_round=3000,
            valid_sets=[train_set, val_set], valid_names=["train", "val"],
            callbacks=[lgb.early_stopping(stopping_rounds=120), lgb.log_evaluation(period=0)],
        )
        pred_val  = model.predict(X_val,  num_iteration=model.best_iteration)
        pred_test = model.predict(X_test, num_iteration=model.best_iteration)
        mae_val  = mean_absolute_error(y_val,  pred_val)
        mae_test = mean_absolute_error(y_test, pred_test)
        rmse_test = float(np.sqrt(mean_squared_error(y_test, pred_test)))
        r2_test = r2_score(y_test, pred_test)
        elapsed = time.time() - t0
        print(f"  val MAE={mae_val:.4f}  test MAE={mae_test:.4f}  RMSE={rmse_test:.4f}  R²={r2_test:.4f}  best_iter={model.best_iteration}  {elapsed:.1f}s")
        log_lines.append(f"[{i+1}] {cfg}  → val={mae_val:.4f}  test={mae_test:.4f}  best_iter={model.best_iteration}  {elapsed:.1f}s")

        rec = {"idx": i+1, "cfg": cfg, "mae_val": mae_val, "mae_test": mae_test, "best_iter": model.best_iteration, "model": model}
        results.append(rec)
        if best is None or rec["mae_val"] < best["mae_val"]:
            best = rec

    print("\n=== 종합 (val MAE 오름차순) ===")
    results_sorted = sorted(results, key=lambda r: r["mae_val"])
    for r in results_sorted:
        print(f"  #{r['idx']:2d}  val={r['mae_val']:.4f}  test={r['mae_test']:.4f}  iter={r['best_iter']:4d}  {r['cfg']}")

    print(f"\n[BEST] #{best['idx']}  val={best['mae_val']:.4f}  test={best['mae_test']:.4f}")
    print(f"  cfg: {best['cfg']}")
    print(f"  v2 baseline test MAE = 0.4820, v3 baseline test MAE = 0.4927")
    print(f"  best 대비: vs v2 {0.482 - best['mae_test']:+.4f}p, vs v3 {0.4927 - best['mae_test']:+.4f}p")

    # best 저장
    pred_train = best["model"].predict(X_train, num_iteration=best["model"].best_iteration)
    mae_train = mean_absolute_error(y_train, pred_train)
    joblib.dump({
        "model": best["model"],
        "encoders": encoders,
        "feature_names": feat_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "model_version": "sajung-lgbm-v3-tuned",
        "metrics": {"mae_train": mae_train, "mae_val": best["mae_val"], "mae_test": best["mae_test"]},
        "tuning_config": best["cfg"],
    }, OUT_PATH)
    print(f"\n[BEST] 저장: {OUT_PATH}")

    LOG_PATH.write_text("\n".join(log_lines), encoding="utf-8")
    print(f"로그: {LOG_PATH}")


if __name__ == "__main__":
    main()

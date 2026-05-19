"""박상빈님 5/19 #7 — 카테고리별 시간 trend ML.

각 카테고리에서 시간 feature 가중 ↑ + 최근 데이터 sample_weight ↑.
박상빈님 의도: 카테고리별 시간 변화 학습 (2026 lwlt 변경 등).

각 카테고리 독립 학습:
  - train_end 위치 = 카테고리별 deadline 정렬 후 70%
  - val_end = 85%
  - sample_weight = 최근 30% 데이터 = 2.0x

학습 시간 = 약 15~30분.
"""
import sys, io, time, re
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


def slug(s):
    return re.sub(r"[^A-Za-z0-9가-힣]+", "_", str(s))[:30]


def main():
    print(f"[{time.strftime('%H:%M:%S')}] 데이터 로드…", flush=True)
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string", "subcat_main": "string",
    }, low_memory=False)
    print(f"  전체 {len(df):,}행", flush=True)
    df = df.sort_values("deadline").reset_index(drop=True)

    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    print(f"  대카테고리 (N>=500): {len(big_cats)}개")

    results = []
    for cat in big_cats:
        sub = df[df["category"] == cat].copy()
        if len(sub) < 500: continue
        sub = sub.sort_values("deadline").reset_index(drop=True)
        n = len(sub)
        train_end = int(n * 0.7)
        val_end   = int(n * 0.85)
        df_train = sub.iloc[:train_end].copy()
        df_val   = sub.iloc[train_end:val_end].copy()
        df_test  = sub.iloc[val_end:].copy()

        # 시간 가중: train 마지막 30% = 2.0x, 그 외 = 1.0x
        weights = np.ones(len(df_train))
        recent_start = int(len(df_train) * 0.7)
        weights[recent_start:] = 2.0

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
        y_train = df_train[TARGET_COL].values
        X_val   = df_val[feature_cols].fillna(0).values
        y_val   = df_val[TARGET_COL].values
        X_test  = df_test[feature_cols].fillna(0).values
        y_test  = df_test[TARGET_COL].values

        cat_idx = list(range(len(CATEGORICAL_COLS)))
        train_set = lgb.Dataset(X_train, y_train, weight=weights, categorical_feature=cat_idx)
        val_set   = lgb.Dataset(X_val, y_val, categorical_feature=cat_idx, reference=train_set)

        params = dict(
            objective="quantile", alpha=0.7, metric="quantile",
            num_leaves=63, learning_rate=0.03,
            feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=5,
            min_data_in_leaf=20, lambda_l1=0.1, lambda_l2=0.1, verbose=-1,
        )
        model = lgb.train(params, train_set, num_boost_round=1500,
                          valid_sets=[val_set], valid_names=["val"],
                          callbacks=[lgb.early_stopping(80, verbose=False)])

        out_path = MODEL_DIR / f"sajung_q70_cat_time_{slug(cat)}.pkl"
        joblib.dump({
            "model": model, "feature_names": feature_cols,
            "categorical_cols": CATEGORICAL_COLS, "numeric_cols": NUMERIC_COLS,
            "encoders": encoders, "alpha": 0.7, "category": cat,
            "model_version": f"sajung-q70-cat-time-{slug(cat)}-2026-05-19",
        }, out_path)

        pred = model.predict(X_test, num_iteration=model.best_iteration)
        dev = np.abs(pred - y_test)
        top1 = (dev <= 0.05).mean() * 100
        disq = (pred < y_test).mean() * 100
        score = top1 - disq * 0.05
        results.append({"cat": cat, "N": n, "iter": model.best_iteration,
                        "top1": top1, "disq": disq, "score": score})
        print(f"  [{cat[:20]:20}] N={n:,} iter={model.best_iteration} | 부적격 {disq:.2f}% / 1위 {top1:.2f}% / 점수 {score:.3f}", flush=True)

    print(f"\n{'='*80}")
    print(f"#7 카테고리별 시간 trend 결과")
    print(f"{'='*80}")
    for r in sorted(results, key=lambda x: -x["score"]):
        print(f"  {r['cat'][:25]:25} 점수 {r['score']:.3f} (부적격 {r['disq']:.2f}% / 1위 {r['top1']:.2f}%)")


if __name__ == "__main__":
    main()

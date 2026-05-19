"""박상빈님 5/19 #9 — 카테고리별 독립 LightGBM Quantile q70 학습.

각 카테고리 (시설공사 / 토목공사 / 전기공사 등 N>=500) 데이터로 독립 학습 →
카테고리별 최적 모델.

알고리즘: LightGBM Quantile (alpha=0.7, B-q70 과 동일)
출력: sajung_quantile_q70_{category_slug}.pkl × N 개
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
MODEL_DIR.mkdir(parents=True, exist_ok=True)

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


def train_one_category(cat_name, sub_df, output_path):
    if len(sub_df) < 500:
        return None

    sub_df = sub_df.sort_values("deadline").reset_index(drop=True)
    n = len(sub_df)
    train_end = int(n * 0.7)
    val_end   = int(n * 0.85)
    df_train = sub_df.iloc[:train_end].copy()
    df_val   = sub_df.iloc[train_end:val_end].copy()
    df_test  = sub_df.iloc[val_end:].copy()

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
    train_set = lgb.Dataset(X_train, y_train, categorical_feature=cat_idx)
    val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=cat_idx, reference=train_set)

    params = dict(
        objective="quantile",
        alpha=0.7,
        metric="quantile",
        num_leaves=63,  # 카테고리별 작은 데이터 = 작은 트리
        learning_rate=0.03,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=20,
        lambda_l1=0.1,
        lambda_l2=0.1,
        verbose=-1,
    )

    model = lgb.train(
        params, train_set,
        num_boost_round=1500,
        valid_sets=[val_set],
        valid_names=["val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=80, verbose=False),
        ],
    )

    payload = {
        "model": model,
        "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "encoders": encoders,
        "alpha": 0.7,
        "category": cat_name,
        "model_version": f"sajung-q70-cat-{slug(cat_name)}-2026-05-19",
    }
    joblib.dump(payload, output_path)

    # test 평가
    pred = model.predict(X_test, num_iteration=model.best_iteration)
    dev = np.abs(pred - y_test)
    return {
        "category": cat_name,
        "N": len(sub_df),
        "test_N": len(df_test),
        "best_iter": model.best_iteration,
        "top1_005": float((dev <= 0.05).mean() * 100),
        "win_05":   float((dev <= 0.5).mean() * 100),
        "win_10":   float((dev <= 1.0).mean() * 100),
        "mae":      float(dev.mean()),
        "disq":     float((pred < y_test).mean() * 100),
    }


def main():
    print(f"[{time.strftime('%H:%M:%S')}] 데이터 로드: {DATA_PATH}", flush=True)
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string",
    }, low_memory=False)
    print(f"  전체 {len(df):,}행", flush=True)

    cat_counts = df["category"].value_counts()
    big_cats = cat_counts[cat_counts >= 500].index.tolist()
    print(f"\n  대카테고리 (N>=500): {len(big_cats)}개")

    results = []
    for cat in big_cats:
        sub = df[df["category"] == cat].copy()
        if len(sub) < 500:
            continue
        out_path = MODEL_DIR / f"sajung_q70_cat_{slug(cat)}.pkl"
        print(f"\n[{time.strftime('%H:%M:%S')}] [{cat}] N={len(sub):,} 학습…", flush=True)
        result = train_one_category(cat, sub, out_path)
        if result is None:
            print(f"  SKIP (N<500)")
            continue
        score = result["top1_005"] - result["disq"] * 0.05
        print(f"  완료 (iter {result['best_iter']}) — 부적격 {result['disq']:.2f}% / 1위 {result['top1_005']:.2f}% / 점수 {score:.3f}")
        print(f"  저장: {out_path.name}")
        results.append(result)

    # 요약 표
    print(f"\n{'='*100}")
    print(f"📊 카테고리별 독립 모델 학습 결과 (test set)")
    print(f"{'='*100}")
    print(f"\n{'카테고리':30} {'전체 N':>10} {'test N':>10} {'부적격':>9} {'1위':>9} {'점수':>9} {'MAE':>9}")
    print("-" * 100)
    for r in sorted(results, key=lambda x: -x["N"]):
        score = r["top1_005"] - r["disq"] * 0.05
        print(f"  {r['category'][:28]:30} {r['N']:>10,} {r['test_N']:>10,} {r['disq']:>8.2f}% {r['top1_005']:>8.2f}% {score:>8.3f} {r['mae']:>8.4f}")

    out_json = ROOT / "data" / f"cat_independent_{int(time.time())}.json"
    import json
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({"results": results}, f, indent=2, ensure_ascii=False, default=float)
    print(f"\n[{time.strftime('%H:%M:%S')}] 저장: {out_json}", flush=True)


if __name__ == "__main__":
    main()

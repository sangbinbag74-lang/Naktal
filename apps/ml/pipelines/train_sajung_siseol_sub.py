"""박상빈님 5/20 #2 — 시설공사 세분화 학습.

시설공사 (1.57M train, 86%) → 발주처 N≥100 vs N<100 분리.
각 sub 별 LightGBM Quantile q70 학습.

학습 시간: 약 30분~1시간.
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


def train_sub(name, df_sub):
    if len(df_sub) < 1000:
        print(f"  [{name}] SKIP (N<1000)")
        return None
    df_sub = df_sub.sort_values("deadline").reset_index(drop=True)
    n = len(df_sub)
    train_end = int(n * 0.7)
    val_end = int(n * 0.85)
    df_train = df_sub.iloc[:train_end].copy()
    df_val = df_sub.iloc[train_end:val_end].copy()
    df_test = df_sub.iloc[val_end:].copy()

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
    train_set = lgb.Dataset(X_train, y_train, categorical_feature=cat_idx)
    val_set = lgb.Dataset(X_val, y_val, categorical_feature=cat_idx, reference=train_set)

    params = dict(
        objective="quantile", alpha=0.7, metric="quantile",
        num_leaves=127, learning_rate=0.03,
        feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=5,
        min_data_in_leaf=30, lambda_l1=0.1, lambda_l2=0.1, verbose=-1,
    )
    model = lgb.train(params, train_set, num_boost_round=2000,
                      valid_sets=[val_set], valid_names=["val"],
                      callbacks=[lgb.early_stopping(100, verbose=False)])

    out_path = MODEL_DIR / f"sajung_q70_siseol_{name}.pkl"
    joblib.dump({
        "model": model, "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS, "numeric_cols": NUMERIC_COLS,
        "encoders": encoders, "alpha": 0.7,
        "model_version": f"sajung-q70-siseol-{name}-2026-05-20",
    }, out_path)

    pred = model.predict(X_test, num_iteration=model.best_iteration)
    dev = np.abs(pred - y_test)
    top1 = (dev <= 0.05).mean() * 100
    disq = (pred < y_test).mean() * 100
    score = top1 - disq * 0.05
    print(f"  [{name}] N={len(df_sub):,} iter={model.best_iteration} | 부적격 {disq:.2f}% / 1위 {top1:.2f}% / 점수 {score:.3f}")
    return {"name": name, "N": len(df_sub), "score": score, "disq": disq, "top1": top1}


def main():
    print(f"[{time.strftime('%H:%M:%S')}] 데이터 로드…", flush=True)
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string", "subcat_main": "string",
    }, low_memory=False)
    df_siseol = df[df["category"] == "시설공사"].copy()
    print(f"  시설공사 전체: {len(df_siseol):,}행", flush=True)

    # 발주처별 N 카운트
    org_cnt = df_siseol.groupby("orgName").size()
    big_orgs = set(org_cnt[org_cnt >= 100].index)
    print(f"  발주처 N≥100: {len(big_orgs):,}개")

    df_big_org = df_siseol[df_siseol["orgName"].isin(big_orgs)].copy()
    df_small_org = df_siseol[~df_siseol["orgName"].isin(big_orgs)].copy()
    print(f"  big_org: {len(df_big_org):,}행 / small_org: {len(df_small_org):,}행")

    # 예산구간별
    df_budget_small = df_siseol[df_siseol["budgetRange"].isin(["0_5억", "5_10억"])].copy()
    df_budget_mid = df_siseol[df_siseol["budgetRange"] == "10_30억"].copy()
    df_budget_big = df_siseol[df_siseol["budgetRange"].isin(["30_100억", "100억_이상"])].copy()

    print(f"\n[{time.strftime('%H:%M:%S')}] 5개 sub 학습 시작…", flush=True)
    results = []
    for name, sub in [
        ("big_org", df_big_org),
        ("small_org", df_small_org),
        ("budget_small", df_budget_small),
        ("budget_mid", df_budget_mid),
        ("budget_big", df_budget_big),
    ]:
        r = train_sub(name, sub)
        if r: results.append(r)

    print(f"\n{'='*80}")
    print(f"#2 시설공사 세분화 결과 (test set)")
    print(f"{'='*80}")
    for r in sorted(results, key=lambda x: -x["score"]):
        print(f"  {r['name'][:15]:15} N={r['N']:>8,} 부적격 {r['disq']:>6.2f}% / 1위 {r['top1']:>5.2f}% / 점수 {r['score']:.3f}")


if __name__ == "__main__":
    main()

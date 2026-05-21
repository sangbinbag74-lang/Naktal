"""
박상빈님 5/19 명시 — B 옵션: Quantile 다중 학습 (11 quantile)

기존 q05/q50/q95 (3 quantile) → q05/q10/q20/q30/q40/q50/q60/q70/q80/q90/q95 (11 quantile)

박스권 정의:
  - 중심 박스권: q40~q60 (1위 가능 구간)
  - 부적격 회피 박스권: q05~q15 차단

알고리즘: LightGBM objective="quantile" + alpha=각 백분위
입력: apps/ml/data/training_data_v2.csv
출력: apps/ml/models/sajung_quantile_q{05,10,20,30,40,50,60,70,80,90,95}.pkl
"""
import sys, io
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path
import time
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

# 박상빈님 5/19 명시 — 11 quantile (박스권 정의: q40~q60 중심)
QUANTILES = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95]


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


def train_one_quantile(alpha, X_train, y_train, X_val, y_val):
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
        num_threads=4,  # 박상빈님 5/21 G-2 — 4 worker × 4 threads = CPU 16 코어 적정
    )
    # LightGBM 4.6 에서 numpy + 컬럼명 list 비호환 → 인덱스 사용
    cat_idx = list(range(len(CATEGORICAL_COLS)))  # 처음 5개 컬럼이 categorical
    train_set = lgb.Dataset(X_train, y_train, categorical_feature=cat_idx)
    val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=cat_idx, reference=train_set)
    print(f"\n[{time.strftime('%H:%M:%S')}] [Quantile α={alpha}] 학습...", flush=True)
    model = lgb.train(
        params, train_set,
        num_boost_round=2000,
        valid_sets=[train_set, val_set],
        valid_names=["train", "val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=100, verbose=False),
            lgb.log_evaluation(period=500),
        ],
    )
    return model


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음")
        sys.exit(1)

    print(f"[{time.strftime('%H:%M:%S')}] 데이터 로드: {DATA_PATH}", flush=True)
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string",
    })
    print(f"[{time.strftime('%H:%M:%S')}] 전체 {len(df):,}행", flush=True)

    # train/val/test 시간 순 분할 (deadline 기준)
    df = df.sort_values("deadline").reset_index(drop=True)
    n = len(df)
    train_end = int(n * 0.7)
    val_end   = int(n * 0.85)
    df_train = df.iloc[:train_end].copy()
    df_val   = df.iloc[train_end:val_end].copy()
    df_test  = df.iloc[val_end:].copy()
    print(f"  train {len(df_train):,} / val {len(df_val):,} / test {len(df_test):,}", flush=True)

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS
    X_train = df_train[feature_cols].fillna(0).values
    y_train = df_train[TARGET_COL].values
    X_val   = df_val[feature_cols].fillna(0).values
    y_val   = df_val[TARGET_COL].values
    X_test  = df_test[feature_cols].fillna(0).values
    y_test  = df_test[TARGET_COL].values

    # 박상빈님 5/21 G-2 — threading 4 worker (LightGBM GIL 해제로 진짜 병렬, 정확도 영향 0)
    # ProcessPoolExecutor = local function pickling 실패 → ThreadPoolExecutor 로 변경
    # 메모리 safety_protocol H + recollect_acceleration (2~4 worker 허용, 5+ 금지)
    from concurrent.futures import ThreadPoolExecutor

    def _train_and_save(alpha):
        m = train_one_quantile(alpha, X_train, y_train, X_val, y_val)
        q_label = f"q{int(alpha*100):02d}"
        out_path = MODEL_DIR / f"sajung_quantile_{q_label}_new.pkl"
        payload = {
            "model": m,
            "feature_names": feature_cols,
            "categorical_cols": CATEGORICAL_COLS,
            "numeric_cols": NUMERIC_COLS,
            "encoders": encoders,
            "alpha": alpha,
            "model_version": f"sajung-quantile-{q_label}-2026-05-21",
        }
        joblib.dump(payload, out_path)
        print(f"  [{time.strftime('%H:%M:%S')}] 저장: {out_path.name} (best iter {m.best_iteration})", flush=True)
        return q_label, m

    models = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for q_label, m in ex.map(_train_and_save, QUANTILES):
            models[q_label] = m

    # 박스권 검증 — q40~q60 안에 실제 y 가 몇 % 포함되는지
    print(f"\n[{time.strftime('%H:%M:%S')}] === 박스권 검증 (test set) ===", flush=True)
    test_preds = {}
    for q_label, model in models.items():
        test_preds[q_label] = model.predict(X_test, num_iteration=model.best_iteration)

    p40 = test_preds["q40"]
    p50 = test_preds["q50"]
    p60 = test_preds["q60"]
    p05 = test_preds["q05"]
    p95 = test_preds["q95"]

    # q40~q60 박스권 (1위 가능 구간)
    in_box_40_60 = ((y_test >= p40) & (y_test <= p60)).mean()
    print(f"  q40~q60 박스권 커버리지: {in_box_40_60*100:.2f}% (이상 20%)")
    box_width_40_60 = (p60 - p40).mean()
    print(f"  q40~q60 박스권 평균 폭: {box_width_40_60:.4f}%p")

    # q05~q95 박스권 (90% CI)
    in_box_05_95 = ((y_test >= p05) & (y_test <= p95)).mean()
    print(f"  q05~q95 박스권 커버리지: {in_box_05_95*100:.2f}% (이상 90%)")
    box_width_05_95 = (p95 - p05).mean()
    print(f"  q05~q95 박스권 평균 폭: {box_width_05_95:.4f}%p")

    # 부적격 박스권 (q05 아래)
    below_q05 = (y_test < p05).mean()
    print(f"  y < q05 (부적격 박스권 위험): {below_q05*100:.2f}% (이상 5%)")

    # q50 단순 추천 정확도
    q50_dev = np.abs(p50 - y_test)
    q50_top1 = (q50_dev <= 0.05).mean() * 100
    print(f"  q50 1위 근접률 (±0.05%p): {q50_top1:.2f}%")
    print(f"  q50 MAE: {q50_dev.mean():.4f}")

    print(f"\n[{time.strftime('%H:%M:%S')}] === 모든 quantile 평균 ===", flush=True)
    for q_label, model in models.items():
        pred = model.predict(X_test, num_iteration=model.best_iteration)
        print(f"  {q_label}: 평균 {pred.mean():.3f}% / std {pred.std():.4f}", flush=True)


if __name__ == "__main__":
    main()

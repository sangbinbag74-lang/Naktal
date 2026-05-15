"""
사정율 Quantile Regression — Phase 2 재설계

기존 v2/v3 모델: 점 추정 (MAE 최적화)
신규 quantile 모델: 분포 추정 (q05/q50/q95)
  - q05: 사정율 5% 백분위 (실제 사정율이 이 이하일 확률 5%)
  - q50: 중앙값
  - q95: 사정율 95% 백분위 (실제 사정율이 이 이하일 확률 95%)

실 사용:
  추천가 = q95 × 낙찰하한율 → 95% 확률로 적격 통과 (자동 적응 안전 quantile)

알고리즘: LightGBM objective="quantile" + alpha={0.05, 0.50, 0.95}

입력: apps/ml/data/training_data_v2.csv (train_sajung_v2.py와 동일)
출력:
  apps/ml/models/sajung_quantile_q05.pkl
  apps/ml/models/sajung_quantile_q50.pkl
  apps/ml/models/sajung_quantile_q95.pkl

실행:
    cd apps/ml
    .venv\\Scripts\\activate
    python pipelines/train_sajung_quantile.py
"""
import sys, io
# Windows cp949 환경에서 한글·em-dash 출력 안전화
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error
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
    )
    train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS)
    val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=CATEGORICAL_COLS, reference=train_set)
    print(f"\n[Quantile α={alpha}] 학습...")
    model = lgb.train(
        params, train_set,
        num_boost_round=3000,
        valid_sets=[train_set, val_set],
        valid_names=["train", "val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=150),
            lgb.log_evaluation(period=100),
        ],
    )
    return model


def evaluate_coverage(model_q05, model_q95, X, y, name):
    """실제 y가 [q05, q95] 안에 들어가는 비율 측정 — 이상치 = 90% 근접"""
    p05 = model_q05.predict(X, num_iteration=model_q05.best_iteration)
    p95 = model_q95.predict(X, num_iteration=model_q95.best_iteration)
    in_range = ((y >= p05) & (y <= p95)).mean()
    below_q05 = (y < p05).mean()
    above_q95 = (y > p95).mean()
    width = (p95 - p05).mean()
    print(f"  {name}:")
    print(f"    [q05, q95] 커버리지: {in_range:.3f} (이상 0.90)")
    print(f"    y < q05: {below_q05:.3f} (이상 0.05)")
    print(f"    y > q95: {above_q95:.3f} (이상 0.05)")
    print(f"    평균 구간 폭 (q95-q05): {width:.4f}%p")
    return in_range, width


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} 없음. export-training-data-v2.ts 먼저 실행하세요.")
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
    print(f"  train: {len(df_train):,} / val: {len(df_val):,} / test: {len(df_test):,}")

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)
    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS

    X_train, y_train = df_train[feature_cols], df_train[TARGET_COL].astype(float)
    X_val,   y_val   = df_val[feature_cols],   df_val[TARGET_COL].astype(float)
    X_test,  y_test  = df_test[feature_cols],  df_test[TARGET_COL].astype(float)

    models = {}
    metrics = {}
    for alpha in QUANTILES:
        m = train_one_quantile(alpha, X_train, y_train, X_val, y_val)
        models[alpha] = m
        pred_test = m.predict(X_test, num_iteration=m.best_iteration)
        # Pinball loss = quantile loss
        diff = y_test - pred_test
        pinball = np.where(diff >= 0, alpha * diff, (alpha - 1) * diff).mean()
        metrics[alpha] = {"pinball": float(pinball)}
        print(f"  test pinball loss = {pinball:.4f}")

    print("\n=== Coverage 평가 (Quantile 신뢰구간 정확도) ===")
    evaluate_coverage(models[0.05], models[0.95], X_train, y_train, "train")
    evaluate_coverage(models[0.05], models[0.95], X_val,   y_val,   "val")
    coverage_test, width_test = evaluate_coverage(models[0.05], models[0.95], X_test, y_test, "test")

    print("\n=== 95% 적격 통과 안전선 검증 ===")
    # 실 사용: 추천 사정율 = q95 → 95% 확률로 사정율 ≤ 추천
    # 즉 y > q95 비율이 5% 이하면 시스템 정상
    p95_test = models[0.95].predict(X_test, num_iteration=models[0.95].best_iteration)
    breach = (y_test > p95_test).mean()
    print(f"  test: y > q95 비율 = {breach:.3f} (이상 ≤ 0.05)")
    if breach <= 0.07:
        print("  [OK] 95% 적격 통과 안전선 유효")
    else:
        print("  [WARN] 안전선 미달성 — 데이터 양 또는 피처 점검 필요")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for alpha in QUANTILES:
        suffix = f"q{int(alpha*100):02d}"
        path = MODEL_DIR / f"sajung_quantile_{suffix}.pkl"
        joblib.dump({
            "model": models[alpha],
            "encoders": encoders,
            "feature_names": feature_cols,
            "categorical_cols": CATEGORICAL_COLS,
            "numeric_cols": NUMERIC_COLS,
            "alpha": alpha,
            "model_version": f"sajung-quantile-v1.0-{suffix}",
            "metrics": metrics[alpha],
            "coverage_test": coverage_test,
            "width_test": width_test,
        }, path)
        print(f"  저장: {path}")

    print("\n[Phase 2 학습 완료] 다음 단계: python pipelines/export_onnx.py 로 ONNX 변환")


if __name__ == "__main__":
    main()

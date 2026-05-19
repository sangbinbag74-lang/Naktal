"""박상빈님 5/19 #8 — Custom loss 학습 (박상빈님 ultimate_goal 직접 최적화).

박상빈님 ultimate_goal 점수 = top1±0.05 - disq×0.05

Custom asymmetric loss:
  - residual = pred - actual
  - residual < 0 (부적격): 2 × residual^2 (강한 penalty)
  - residual >= 0 (안전):   residual^2 (보통 penalty)
  - |residual| < 0.05 (1위): residual^2 × 0.5 (보너스, 작은 penalty)

= 부적격 강제 회피 + 1위 영역 보너스 = 박상빈님 ultimate_goal 직접 최적화.

알고리즘: LightGBM custom objective + 1.84M 학습 데이터.
출력: sajung_custom_loss.pkl
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


def custom_objective(y_pred, dataset):
    """박상빈님 ultimate_goal 직접 최적화 — asymmetric loss

    grad = ∂L/∂pred, hess = ∂²L/∂pred²

    L(pred, y) =
      - 2*(pred-y)^2   if pred < y (부적격, 강한 penalty)
      - 0.5*(pred-y)^2 if |pred-y| <= 0.05 (1위 영역, 보너스)
      - 1.0*(pred-y)^2 otherwise (안전, 보통)
    """
    y_true = dataset.get_label()
    residual = y_pred - y_true
    is_disq = residual < 0
    is_top1 = np.abs(residual) <= 0.05

    # weight = 2 (부적격) or 0.5 (1위) or 1.0 (보통)
    weight = np.where(is_disq, 2.0,
              np.where(is_top1, 0.5, 1.0))

    grad = 2 * weight * residual
    hess = 2 * weight
    return grad, hess


def custom_eval(y_pred, dataset):
    """평가 메트릭 = 박상빈님 ultimate_goal 점수 (negative)"""
    y_true = dataset.get_label()
    dev = np.abs(y_pred - y_true)
    top1 = (dev <= 0.05).mean() * 100
    disq = (y_pred < y_true).mean() * 100
    score = top1 - disq * 0.05
    return ("ultimate_score", score, True)  # higher is better


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

    cat_idx = list(range(len(CATEGORICAL_COLS)))
    train_set = lgb.Dataset(X_train, y_train, categorical_feature=cat_idx)
    val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=cat_idx, reference=train_set)

    params = dict(
        objective=custom_objective,
        metric="None",  # default metric 제거 — feval(ultimate_score) 만 사용
        num_leaves=127,
        learning_rate=0.05,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=30,
        lambda_l1=0.1,
        lambda_l2=0.1,
        verbose=-1,
    )

    print(f"\n[{time.strftime('%H:%M:%S')}] Custom loss 학습 시작…", flush=True)
    model = lgb.train(
        params, train_set,
        num_boost_round=5000,
        valid_sets=[train_set, val_set],
        valid_names=["train", "val"],
        feval=custom_eval,
        callbacks=[
            lgb.early_stopping(stopping_rounds=300, first_metric_only=True, verbose=False),
            lgb.log_evaluation(period=200),
        ],
    )
    print(f"[{time.strftime('%H:%M:%S')}] 학습 완료. best iter {model.best_iteration}", flush=True)

    # 저장
    out_path = MODEL_DIR / "sajung_custom_loss.pkl"
    payload = {
        "model": model,
        "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "encoders": encoders,
        "model_version": "sajung-custom-loss-2026-05-19",
    }
    joblib.dump(payload, out_path)
    print(f"  저장: {out_path}", flush=True)

    # test set 평가
    print(f"\n[{time.strftime('%H:%M:%S')}] === test set 평가 ===", flush=True)
    pred = model.predict(X_test, num_iteration=model.best_iteration)
    dev = np.abs(pred - y_test)
    top1_005 = (dev <= 0.05).mean() * 100
    top1_01  = (dev <= 0.1).mean() * 100
    win_05   = (dev <= 0.5).mean() * 100
    win_10   = (dev <= 1.0).mean() * 100
    mae      = dev.mean()
    disq     = (pred < y_test).mean() * 100
    score    = top1_005 - disq * 0.05
    print(f"  부적격율 (pred < actual): {disq:.2f}%")
    print(f"  1위 ±0.05%p: {top1_005:.2f}%")
    print(f"  1위 ±0.1%p:  {top1_01:.2f}%")
    print(f"  진입 ±0.5%p: {win_05:.2f}%")
    print(f"  진입 ±1.0%p: {win_10:.2f}%")
    print(f"  MAE: {mae:.4f}")
    print(f"  박상빈님 ultimate_goal 점수: {score:.3f}")
    print(f"\n  예측 분포: 평균 {pred.mean():.3f}%, std {pred.std():.4f}, min {pred.min():.3f}, max {pred.max():.3f}")


if __name__ == "__main__":
    main()

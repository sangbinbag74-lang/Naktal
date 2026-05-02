"""
LightGBM 사정율 예측 v3 — openedAt 시즌/요일/시간대 피처 추가

v2 (54 피처) + 신규 6 피처 = 60 피처
신규 피처 (BidResult.openedAt 99.9999% 채움 활용):
  - opened_month: KST 실제 개찰 월
  - opened_weekday: KST 요일 (0~6)
  - opened_hour: KST 시 (0~23)
  - opened_season_q: KST 분기 (1~4)
  - days_deadline_to_open: 마감→개찰 일수
  - is_morning_open: 오전 개찰 1/0

입력: apps/ml/data/training_data_v3.csv (merge_raw.py 실행 결과)
출력: apps/ml/models/sajung_lgbm_v3.pkl

목표 MAE ≤ 0.40% (vs v2 0.482%)

실행:
    cd apps/ml
    .venv\\Scripts\\activate   (Windows)
    python pipelines/train_sajung_v3.py
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "training_data_v3.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "sajung_lgbm_v3.pkl"

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
    # v3 신규 6
    "opened_month", "opened_weekday", "opened_hour",
    "opened_season_q", "days_deadline_to_open", "is_morning_open",
]
TARGET_COL = "sajung_rate"


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
        print(f"ERROR: {DATA_PATH} 없음. 먼저 merge_raw.py 실행하세요.")
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
    print(f"  train: {len(df_train):,}")
    print(f"  val:   {len(df_val):,}")
    print(f"  test:  {len(df_test):,}")

    if len(df_train) < 10000:
        print("WARN: train 데이터 10000건 미만, 품질 저하 우려")

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS
    print(f"\n피처 {len(feature_cols)}개 (v3 = v2 + openedAt 6)")

    X_train, y_train = df_train[feature_cols], df_train[TARGET_COL].astype(float)
    X_val,   y_val   = df_val[feature_cols],   df_val[TARGET_COL].astype(float)
    X_test,  y_test  = df_test[feature_cols],  df_test[TARGET_COL].astype(float)

    params = dict(
        objective="regression_l1",
        metric="mae",
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

    print("\n학습 시작...")
    model = lgb.train(
        params,
        train_set,
        num_boost_round=3000,
        valid_sets=[train_set, val_set],
        valid_names=["train", "val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=150),
            lgb.log_evaluation(period=50),
        ],
    )

    print("\n평가:")
    def report(name, X, y):
        pred = model.predict(X, num_iteration=model.best_iteration)
        mae = mean_absolute_error(y, pred)
        rmse = np.sqrt(mean_squared_error(y, pred))
        r2 = r2_score(y, pred)
        print(f"  {name}: MAE={mae:.4f}  RMSE={rmse:.4f}  R²={r2:.4f}")
        return mae

    mae_train = report("train", X_train, y_train)
    mae_val = report("val",   X_val,   y_val)
    mae_test = report("test",  X_test,  y_test)

    print("\n상위 피처 중요도 (Top 20):")
    imp = pd.DataFrame({
        "feature": feature_cols,
        "importance": model.feature_importance(importance_type="gain"),
    }).sort_values("importance", ascending=False)
    for _, row in imp.head(20).iterrows():
        print(f"  {row['feature']}: {row['importance']:.0f}")

    target_mae = 0.40
    print(f"\n목표 MAE ≤ {target_mae}% vs 실제 test MAE = {mae_test:.4f}%")
    if mae_test <= target_mae:
        print("[OK] 목표 달성")
    else:
        print(f"[INFO] v2(0.482) 대비 개선폭: {0.482 - mae_test:+.4f}p")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": model,
        "encoders": encoders,
        "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS,
        "model_version": "sajung-lgbm-v3.0",
        "metrics": {
            "mae_train": mae_train,
            "mae_val": mae_val,
            "mae_test": mae_test,
        },
    }, MODEL_PATH)
    print(f"\n모델 저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()

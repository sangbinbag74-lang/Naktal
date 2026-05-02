"""
LightGBM 사정율 예측 v4 — v3 + KoBERT title 임베딩 64d 추가 (총 124 피처)

근거:
  v3 baseline test MAE 0.4927, tuned 0.4908, v2 단독 0.4814 — 수치 피처만으로는 천장.
  공고 제목(title)에는 발주처 의도/특수성/사업 성격 정보가 함축. KoBERT 임베딩으로 추출.

선결:
  1. apps/crawler/src/scripts/export-raw-tables.ts 의 ann_title dump 실행
  2. python pipelines/embed_titles_sajung.py 실행 → title_emb_sajung_64.npy

입력:
  apps/ml/data/training_data_v3.csv (konepsId 컬럼 포함)
  apps/ml/data/title_emb_sajung_64.npy (training_data_v3.csv 행 순서와 동일)

출력:
  apps/ml/models/sajung_lgbm_v4.pkl

목표: test MAE < v2 단독 0.4814 (즉 v3+title이 v2보다 좋아야 의미 있음)
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
EMB_PATH = ROOT / "data" / "title_emb_sajung_64.npy"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "sajung_lgbm_v4.pkl"

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
EMB_DIM = 64
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
        print(f"ERROR: {DATA_PATH} 없음")
        sys.exit(1)
    if not EMB_PATH.exists():
        print(f"ERROR: {EMB_PATH} 없음 — embed_titles_sajung.py 먼저 실행 필요")
        sys.exit(2)

    print(f"데이터 로드: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, dtype={
        "category": "string", "orgName": "string",
        "budgetRange": "string", "region": "string",
        "subcat_main": "string", "split": "string",
        "konepsId": "string",
    })
    print(f"전체: {len(df):,}건")

    print(f"임베딩 로드: {EMB_PATH}")
    emb = np.load(EMB_PATH)
    print(f"  shape: {emb.shape}")
    if emb.shape[0] != len(df):
        print(f"ERROR: 임베딩 행수 {emb.shape[0]} != 데이터 행수 {len(df)}")
        sys.exit(3)

    emb_cols = [f"emb_{i}" for i in range(EMB_DIM)]
    emb_df = pd.DataFrame(emb, columns=emb_cols, dtype=np.float32, index=df.index)
    df = pd.concat([df, emb_df], axis=1)

    df_train = df[df["split"] == "train"].copy()
    df_val   = df[df["split"] == "val"].copy()
    df_test  = df[df["split"] == "test"].copy()
    print(f"  train: {len(df_train):,}  val: {len(df_val):,}  test: {len(df_test):,}")

    df_train, df_val, df_test, encoders = encode_categoricals(df_train, df_val, df_test)

    feature_cols = CATEGORICAL_COLS + NUMERIC_COLS + emb_cols
    print(f"\n피처 {len(feature_cols)}개 (v4 = v3 60 + emb 64)")

    X_train, y_train = df_train[feature_cols], df_train[TARGET_COL].astype(float)
    X_val,   y_val   = df_val[feature_cols],   df_val[TARGET_COL].astype(float)
    X_test,  y_test  = df_test[feature_cols],  df_test[TARGET_COL].astype(float)

    params = dict(
        objective="regression_l1",
        metric="mae",
        num_leaves=255,
        learning_rate=0.01,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        min_data_in_leaf=30,
        lambda_l1=0.1,
        lambda_l2=0.1,
        feature_pre_filter=False,
        verbose=-1,
    )

    train_set = lgb.Dataset(X_train, y_train, categorical_feature=CATEGORICAL_COLS,
                             params={"feature_pre_filter": False})
    val_set   = lgb.Dataset(X_val,   y_val,   categorical_feature=CATEGORICAL_COLS,
                             reference=train_set, params={"feature_pre_filter": False})

    print("\n학습 시작...")
    model = lgb.train(
        params, train_set, num_boost_round=5000,
        valid_sets=[train_set, val_set], valid_names=["train", "val"],
        callbacks=[lgb.early_stopping(stopping_rounds=200), lgb.log_evaluation(period=100)],
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
    mae_val   = report("val",   X_val,   y_val)
    mae_test  = report("test",  X_test,  y_test)

    print("\n상위 피처 중요도 (Top 20):")
    imp = pd.DataFrame({
        "feature": feature_cols,
        "importance": model.feature_importance(importance_type="gain"),
    }).sort_values("importance", ascending=False)
    for _, row in imp.head(20).iterrows():
        print(f"  {row['feature']}: {row['importance']:.0f}")
    n_emb_top20 = sum(1 for _, r in imp.head(20).iterrows() if r['feature'].startswith("emb_"))
    print(f"  (Top 20 중 emb_*: {n_emb_top20}개)")

    print(f"\n비교: v2 0.4814 / v3 0.4927 / tuned 0.4908 / v4 {mae_test:.4f}")
    print(f"  vs v2: {0.4814 - mae_test:+.4f}p")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model": model,
        "encoders": encoders,
        "feature_names": feature_cols,
        "categorical_cols": CATEGORICAL_COLS,
        "numeric_cols": NUMERIC_COLS + emb_cols,
        "model_version": "sajung-lgbm-v4-kobert",
        "metrics": {
            "mae_train": mae_train,
            "mae_val": mae_val,
            "mae_test": mae_test,
        },
    }, MODEL_PATH)
    print(f"\n저장: {MODEL_PATH}")


if __name__ == "__main__":
    main()
